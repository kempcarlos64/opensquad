import { describe, expect, it } from "vitest";

import type { ScriptCandidate } from "@/lib/domain";
import {
  semanticAgreement,
  weightedCandidateScore,
} from "@/server/providers/scripts/scoring";

const candidate: ScriptCandidate = {
  agent: "retention",
  title: "Teste",
  hook: "Transforme conhecimento em conteúdo consistente",
  spoken_script: "Transforme conhecimento em conteúdo consistente usando um processo simples e revisável.",
  cta: "Conheça o Besorah",
  estimated_seconds: 20,
  scene_beats: [{ order: 1, spoken: "Teste", visual: "Avatar" }],
  scores: { hook: 10, retention: 8, clarity: 9, brand: 9, conversion: 8, naturalness: 9, factual_safety: 10 },
  risk_flags: [],
  reasoning_summary: "Sem alegações externas.",
};

describe("convergence scoring", () => {
  it("applies the documented weighted rubric", () => {
    expect(weightedCandidateScore(candidate)).toBe(90);
  });

  it("returns high agreement for semantically equal candidates", () => {
    const other = { ...candidate, agent: "conversion" as const };
    expect(semanticAgreement([candidate, other])).toBe(100);
  });
});
