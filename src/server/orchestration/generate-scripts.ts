import type {
  AgentType,
  FinalScript,
  QualityCriterion,
  RetryDirective,
  RunMetadata,
  ScriptCandidate,
  VideoBrief,
} from "@/lib/domain";
import { finalScriptSchema } from "@/lib/domain";
import {
  addAuditEvent,
  getProject,
  saveCandidate,
  saveConvergence,
  updateProject,
} from "@/server/db/repository";
import { logger } from "@/server/logger";
import { getScriptProvider, type ScriptProvider } from "@/server/providers/scripts";
import { researchReelsPatterns } from "@/server/providers/research/reels-research";
import { getEnv } from "@/server/env";
import {
  auditCandidateReferences,
  enforceQualityGate,
  normalizeBriefReferences,
} from "@/server/providers/scripts/scoring";

const agents: AgentType[] = ["retention", "conversion", "naturalness"];
const maxRounds = 3;

function failedMetadata(model: string, latencyMs: number): RunMetadata {
  return {
    model,
    promptVersion: "unavailable",
    latencyMs,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  };
}

function humanReviewFallback(candidates: ScriptCandidate[], reason: string): FinalScript {
  const best = candidates[0];
  const criteria: QualityCriterion[] = [
    "hook",
    "retention_architecture",
    "strategic_clarity",
    "organic_value",
    "conversion",
    "naturalness",
    "brand_fit",
    "factual_integrity",
    "originality_safety",
    "production_readiness",
  ];
  return finalScriptSchema.parse({
    decision: "human_review",
    final_score: 0,
    agreement_score: 0,
    hook: best?.hook ?? "Revisão humana necessária",
    spoken_script: best?.spoken_script ?? "Não foi possível gerar candidatos suficientes com segurança.",
    cta: best?.cta ?? "Revise o briefing e tente novamente.",
    scene_plan: best
      ? best.scene_beats.map((beat) => ({ ...beat, duration_seconds: 4 }))
      : [{ order: 1, spoken: reason, visual: "Revisão humana", duration_seconds: 4 }],
    fact_checks: [],
    selected_elements: [],
    rejection_reasons: [reason],
    quality_rubric: criteria.map((criterion) => ({
      criterion,
      score: 0,
      evidence: reason,
      blocking_issue: true,
    })),
    reference_audit: {
      reference_ids_used: [],
      adapted_patterns: [],
      similarity_risk: "low",
      prohibited_copy_detected: false,
      notes: ["Não há candidatos suficientes para concluir a auditoria de referências."],
    },
    retry_directive: {
      required_changes: [reason],
      preserve: [],
      do_not_repeat: [],
    },
  });
}

export async function generateScriptsForProject(
  projectId: string,
  provider: ScriptProvider = getScriptProvider(),
) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (project.finalScriptJson) return project.finalScriptJson;

  let workingBrief: VideoBrief = project.briefJson;
  if (provider.mode === "openai" && getEnv().REELS_RESEARCH_ENABLED) {
    await addAuditEvent(projectId, "research.started", { provider: "openai_web_search" });
    try {
      const research = await researchReelsPatterns(workingBrief);
      workingBrief = research.enrichedBrief;
      await addAuditEvent(projectId, "research.completed", {
        summary: research.report.search_summary,
        patterns: research.report.patterns,
        metadata: research.metadata,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na pesquisa de referências.";
      logger.warn("reels_research.failed", { projectId, message });
      await addAuditEvent(projectId, "research.failed", { message });
    }
  }

  workingBrief = normalizeBriefReferences(workingBrief);
  let retryDirective: RetryDirective | null = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    await addAuditEvent(projectId, "scripts.round_started", { round, mode: provider.mode });
    const starts = new Map<AgentType, number>();
    const settled = await Promise.allSettled(
      agents.map((agent) => {
        starts.set(agent, performance.now());
        return provider.generateCandidate(agent, workingBrief, round, retryDirective);
      }),
    );

    const successful: ScriptCandidate[] = [];
    await Promise.all(
      settled.map(async (result, index) => {
        const agent = agents[index];
        if (!agent) return;
        if (result.status === "fulfilled") {
          const auditedOutput = auditCandidateReferences(result.value.output, workingBrief);
          successful.push(auditedOutput);
          await saveCandidate({
            projectId,
            agent,
            version: round,
            metadata: result.value.metadata,
            output: auditedOutput,
          });
          return;
        }
        const message = result.reason instanceof Error ? result.reason.message : "Agent failed";
        await saveCandidate({
          projectId,
          agent,
          version: round,
          metadata: failedMetadata(
            provider.candidateModel,
            Math.round(performance.now() - (starts.get(agent) ?? performance.now())),
          ),
          errorMessage: message,
        });
        logger.warn("script_agent.failed", { projectId, agent, round, message });
      }),
    );

    if (successful.length < 2) {
      await addAuditEvent(projectId, "scripts.insufficient_candidates", {
        round,
        successful: successful.length,
      });
      if (round < maxRounds) continue;
      const fallback = humanReviewFallback(successful, "Menos de dois roteiristas concluíram após três rodadas.");
      await updateProject(projectId, { status: "human_review", finalScriptJson: fallback });
      return fallback;
    }

    const judged = await provider.judge(workingBrief, successful, round);
    let final = enforceQualityGate(judged.output, round, maxRounds);
    if (round === maxRounds && final.decision === "retry") {
      final = { ...final, decision: "human_review", rejection_reasons: [...final.rejection_reasons, "Limite de duas rodadas de retry atingido."] };
    }
    await saveConvergence({ projectId, version: round, metadata: judged.metadata, output: final });
    await addAuditEvent(projectId, "judge.completed", {
      round,
      decision: final.decision,
      score: final.final_score,
      agreement: final.agreement_score,
    });

    if (final.decision === "retry") {
      retryDirective = final.retry_directive;
      continue;
    }
    await updateProject(projectId, {
      status: final.decision === "approved" ? "scripts_ready" : "human_review",
      finalScriptJson: final,
    });
    return final;
  }

  throw new Error("Orchestration ended without a final decision");
}
