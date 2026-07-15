import { describe, expect, it, vi } from "vitest";

import type { ScriptProvider } from "@/server/providers/scripts";
import { MockScriptProvider } from "@/server/providers/scripts/mock";

describe("parallel script orchestration contract", () => {
  it("keeps successful agents when one rejects", async () => {
    const mock = new MockScriptProvider();
    const provider: ScriptProvider = {
      ...mock,
      mode: "mock",
      candidateModel: mock.candidateModel,
      judgeModel: mock.judgeModel,
      generateCandidate: vi.fn(async (agent, brief, round, retryDirective) => {
        if (agent === "conversion") throw new Error("isolated failure");
        return mock.generateCandidate(agent, brief, round, retryDirective);
      }),
      judge: mock.judge.bind(mock),
    };
    const brief = {
      objective: "Criar conteúdo orgânico útil",
      audience: "Profissionais liberais",
      offer: "um processo de conteúdo assistido",
      tone: ["claro"],
      duration_seconds: 30,
      cta: "Conheça o Besorah",
      source_patterns: [],
      allowed_claims: [],
      forbidden_claims: [],
      brand_context: { company: "Besorah", positioning: "Conteúdo com consistência" },
      language: "pt-BR" as const,
    };
    const settled = await Promise.allSettled(
      (["retention", "conversion", "naturalness"] as const).map((agent) =>
        provider.generateCandidate(agent, brief, 1, null),
      ),
    );
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
