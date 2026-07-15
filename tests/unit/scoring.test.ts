import { describe, expect, it } from "vitest";

import type { FinalScript, QualityCriterion, ScriptCandidate } from "@/lib/domain";
import {
  auditCandidateReferences,
  enforceQualityGate,
  semanticAgreement,
  weightedCandidateScore,
  weightedQualityRubricScore,
} from "@/server/providers/scripts/scoring";

const candidate: ScriptCandidate = {
  agent: "retention",
  title: "Teste",
  hook: "Transforme conhecimento em conteúdo consistente",
  spoken_script: "Transforme conhecimento em conteúdo consistente usando um processo simples e revisável.",
  cta: "Conheça o Besorah",
  estimated_seconds: 20,
  scene_beats: [{ order: 1, purpose: "gancho", spoken: "Teste", visual: "Avatar", estimated_seconds: 3 }],
  strategy: {
    audience_tension: "A produção de conteúdo depende de improviso.",
    thesis: "Um processo revisável aumenta a consistência operacional.",
    promise: "Apresentar um caminho mais claro para produzir conteúdo.",
    mechanism: "Processo assistido de roteiro e vídeo.",
    proof_boundary: "Sem alegações de resultado.",
    retention_devices: ["contraste"],
    cta_logic: "O CTA oferece o próximo passo coerente.",
  },
  reference_adaptations: [],
  claim_ledger: [],
  originality_check: {
    no_verbatim_copy: true,
    no_distinctive_visual_copy: true,
    similarity_risk: "low",
    notes: ["Sem referências fornecidas."],
  },
  scores: { hook: 10, retention: 8, clarity: 9, brand: 9, conversion: 8, naturalness: 9, factual_safety: 10 },
  risk_flags: [],
  reasoning_summary: "Sem alegações externas.",
};

const qualityCriteria: QualityCriterion[] = [
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

describe("convergence scoring", () => {
  it("applies the documented weighted rubric", () => {
    expect(weightedCandidateScore(candidate)).toBe(90);
  });

  it("returns high agreement for semantically equal candidates", () => {
    const other = { ...candidate, agent: "conversion" as const };
    expect(semanticAgreement([candidate, other])).toBe(100);
  });

  it("uses the canonical ten-criterion rubric and blocks weak factual integrity", () => {
    const rubric: FinalScript["quality_rubric"] = qualityCriteria.map((criterion) => ({
      criterion,
      score: criterion === "factual_integrity" ? 8 : 9,
      evidence: `Evidência para ${criterion}.`,
      blocking_issue: false,
    }));
    const final: FinalScript = {
      decision: "approved",
      final_score: 100,
      agreement_score: 90,
      hook: candidate.hook,
      spoken_script: candidate.spoken_script,
      cta: candidate.cta,
      scene_plan: [{ order: 1, spoken: "Teste", visual: "Avatar", duration_seconds: 3 }],
      fact_checks: [],
      selected_elements: [],
      rejection_reasons: [],
      quality_rubric: rubric,
      reference_audit: {
        reference_ids_used: [],
        adapted_patterns: [],
        similarity_risk: "low",
        prohibited_copy_detected: false,
        notes: [],
      },
      retry_directive: { required_changes: [], preserve: [], do_not_repeat: [] },
    };

    expect(weightedQualityRubricScore(rubric)).toBe(89);
    const gated = enforceQualityGate(final, 1, 3);
    expect(gated.decision).toBe("retry");
    expect(gated.retry_directive.required_changes.join(" ")).toContain("Integridade factual");
  });

  it("flags six-word overlap with a supplied reference", () => {
    const audited = auditCandidateReferences(candidate, {
      objective: "Criar conteúdo orgânico útil",
      audience: "Profissionais liberais",
      offer: "um processo de conteúdo assistido",
      tone: ["claro"],
      duration_seconds: 30,
      cta: "Conheça o Besorah",
      source_patterns: [{
        id: "ref-copy",
        description: candidate.spoken_script,
      }],
      allowed_claims: [],
      forbidden_claims: [],
      brand_context: { company: "Besorah", positioning: "Conteúdo com consistência" },
      language: "pt-BR",
    });

    expect(audited.originality_check.no_verbatim_copy).toBe(false);
    expect(audited.originality_check.similarity_risk).toBe("high");
    expect(audited.risk_flags).toContain("REFERENCE_VERBATIM_OVERLAP");
  });
});
