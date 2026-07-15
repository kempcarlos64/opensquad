import type {
  AgentType,
  FinalScript,
  ScriptCandidate,
  VideoBrief,
} from "@/lib/domain";
import { finalScriptSchema, scriptCandidateSchema } from "@/lib/domain";

import { loadAgentPrompt, loadJudgePrompt } from "./prompt-loader";
import { semanticAgreement, weightedCandidateScore } from "./scoring";
import type { ProviderRun, ScriptProvider } from "./types";

const profiles: Record<AgentType, { title: string; lead: string; scores: ScriptCandidate["scores"] }> = {
  retention: {
    title: "O conteúdo que trabalha antes de você",
    lead: "Você ainda perde horas tentando transformar uma boa ideia em conteúdo?",
    scores: { hook: 9.5, retention: 9.3, clarity: 8.8, brand: 8.6, conversion: 8.4, naturalness: 8.8, factual_safety: 10 },
  },
  conversion: {
    title: "Da ideia ao conteúdo que vende",
    lead: "Ter conhecimento não basta quando ele nunca vira conteúdo consistente.",
    scores: { hook: 8.8, retention: 8.6, clarity: 9.1, brand: 9.5, conversion: 9.6, naturalness: 8.6, factual_safety: 10 },
  },
  naturalness: {
    title: "Conteúdo sem cara de propaganda",
    lead: "Sabe aquela ideia boa que fica parada porque produzir parece complicado?",
    scores: { hook: 9, retention: 8.8, clarity: 9.5, brand: 8.8, conversion: 8.6, naturalness: 9.8, factual_safety: 10 },
  },
};

function bodyFor(agent: AgentType, brief: VideoBrief): string {
  const profile = profiles[agent];
  const mechanism = `Com o Besorah, ${brief.offer.toLocaleLowerCase("pt-BR")} ganha um fluxo claro: você define a mensagem, revisa o roteiro e transforma a ideia em um vídeo pronto para publicar.`;
  const variations: Record<AgentType, string> = {
    retention: `${profile.lead} O problema não é falta de assunto. É o caminho confuso entre pensar, roteirizar e publicar. ${mechanism} Menos etapas soltas, mais consistência. ${brief.cta}`,
    conversion: `${profile.lead} Quando a produção depende de improviso, a sua marca some da rotina do público. ${mechanism} Você mantém a voz da marca e decide o que vai ao ar. ${brief.cta}`,
    naturalness: `${profile.lead} Você não precisa começar do zero toda vez. ${mechanism} Assim, o conteúdo continua com a sua cara, só que sem travar a agenda. ${brief.cta}`,
  };
  return variations[agent];
}

export class MockScriptProvider implements ScriptProvider {
  readonly mode = "mock" as const;
  readonly candidateModel = "mock-besorah-writers-v1";
  readonly judgeModel = "mock-besorah-judge-v1";

  async generateCandidate(
    agent: AgentType,
    brief: VideoBrief,
    round: number,
  ): Promise<ProviderRun<ScriptCandidate>> {
    const started = performance.now();
    const prompt = await loadAgentPrompt(agent);
    await new Promise((resolve) => setTimeout(resolve, 12 + round * 2));
    const profile = profiles[agent];
    const spokenScript = bodyFor(agent, brief);
    const output = scriptCandidateSchema.parse({
      agent,
      title: profile.title,
      hook: profile.lead,
      spoken_script: spokenScript,
      cta: brief.cta,
      estimated_seconds: Math.min(brief.duration_seconds, Math.max(20, spokenScript.split(/\s+/).length / 2.6)),
      scene_beats: [
        { order: 1, spoken: profile.lead, visual: "Close no avatar, título curto no topo" },
        { order: 2, spoken: spokenScript, visual: "Avatar com cortes discretos e palavras-chave" },
        { order: 3, spoken: brief.cta, visual: "Tela final com CTA e marca Besorah" },
      ],
      scores: profile.scores,
      risk_flags: [],
      reasoning_summary: `Versão ${round}: foco em ${agent}, sem adicionar alegações além do briefing.`,
    });
    return {
      output,
      metadata: {
        model: this.candidateModel,
        promptVersion: prompt.version,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      },
    };
  }

  async judge(
    brief: VideoBrief,
    candidates: ScriptCandidate[],
    round: number,
  ): Promise<ProviderRun<FinalScript>> {
    const started = performance.now();
    const prompt = await loadJudgePrompt();
    const ranked = [...candidates].sort(
      (left, right) => weightedCandidateScore(right) - weightedCandidateScore(left),
    );
    const retention = candidates.find((candidate) => candidate.agent === "retention") ?? ranked[0];
    const conversion = candidates.find((candidate) => candidate.agent === "conversion") ?? ranked[0];
    const naturalness = candidates.find((candidate) => candidate.agent === "naturalness") ?? ranked[0];
    if (!retention || !conversion || !naturalness) throw new Error("Not enough candidates to converge");

    const spokenScript = `${retention.hook} O problema não é falta de ideias: é transformar conhecimento em uma rotina de conteúdo. Com o Besorah, você organiza a mensagem, revisa o roteiro e leva a ideia até um vídeo pronto para publicar, mantendo a voz da sua marca. ${brief.cta}`;
    const score = Math.round(
      ranked.reduce((sum, candidate) => sum + weightedCandidateScore(candidate), 0) /
        ranked.length,
    );
    const shouldRetry = brief.objective.includes("[forçar retry]") && round < 3;
    const output = finalScriptSchema.parse({
      decision: shouldRetry ? "retry" : score >= 85 ? "approved" : "human_review",
      final_score: score,
      agreement_score: Math.max(86, semanticAgreement(candidates)),
      hook: retention.hook,
      spoken_script: spokenScript,
      cta: brief.cta,
      scene_plan: [
        { order: 1, spoken: retention.hook, visual: "Avatar em close com gancho", duration_seconds: 2 },
        { order: 2, spoken: spokenScript, visual: "Avatar e títulos curtos", duration_seconds: Math.max(12, brief.duration_seconds - 6) },
        { order: 3, spoken: brief.cta, visual: "Outro Besorah e CTA", duration_seconds: 4 },
      ],
      fact_checks: brief.allowed_claims.map((claim) => ({
        claim,
        status: "supported" as const,
        rationale: "Alegação fornecida explicitamente no briefing.",
      })),
      selected_elements: [
        { agent: "retention", element: "gancho", rationale: "Maior força nos primeiros segundos." },
        { agent: "conversion", element: "mecanismo", rationale: "Conecta problema, processo e marca." },
        { agent: "naturalness", element: "redação oral", rationale: "Mantém frases naturais e faláveis." },
      ],
      rejection_reasons: brief.forbidden_claims.map((claim) => `Alegação proibida removida: ${claim}`),
    });
    return {
      output,
      metadata: {
        model: this.judgeModel,
        promptVersion: prompt.version,
        latencyMs: Math.round(performance.now() - started),
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      },
    };
  }
}
