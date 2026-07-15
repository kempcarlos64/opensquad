import { describe, expect, it } from "vitest";

import { reelsResearchSchema } from "@/server/providers/research/reels-research";

describe("reels research schema", () => {
  it("requires URLs, evidence and explicit unknown metrics", () => {
    const parsed = reelsResearchSchema.parse({
      search_summary: "Uma referência pública relevante foi encontrada e normalizada.",
      patterns: [
        {
          source_url: "https://www.instagram.com/reel/example/",
          platform: "instagram",
          content_type: "organic",
          pattern: "Gancho de contraste seguido por demonstração curta e CTA contextual.",
          evidence: "A página pública mostra a estrutura descrita, sem métrica verificável.",
          public_metrics: {
            views: "unknown",
            likes: "unknown",
            comments: "unknown",
            shares: "unknown",
          },
          adaptation_guardrail: "Usar a lógica do contraste com texto, cenas e identidade originais.",
        },
      ],
    });

    expect(parsed.patterns[0]?.public_metrics.views).toBe("unknown");
  });

  it("rejects invented free-form metrics", () => {
    expect(() =>
      reelsResearchSchema.parse({
        search_summary: "Resumo de pesquisa com dados não verificáveis para teste.",
        patterns: [
          {
            source_url: "https://www.instagram.com/reel/example/",
            platform: "instagram",
            content_type: "organic",
            pattern: "Estrutura de vídeo suficientemente descrita para passar o limite mínimo.",
            evidence: "Evidência pública descrita de forma objetiva.",
            public_metrics: {
              views: "milhões",
              likes: "unknown",
              comments: "unknown",
              shares: "unknown",
            },
            adaptation_guardrail: "Não copiar o texto ou os elementos identificáveis.",
          },
        ],
      }),
    ).toThrow();
  });
});
