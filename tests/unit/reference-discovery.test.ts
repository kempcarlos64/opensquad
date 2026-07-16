import { describe, expect, it } from "vitest";

import {
  referenceDiscoveryInputSchema,
  referenceDiscoveryResponseSchema,
  researchToCandidates,
} from "@/server/services/reference-discovery";

describe("reference discovery contracts", () => {
  it("accepts a focused discovery brief", () => {
    const input = referenceDiscoveryInputSchema.parse({
      objective: "Transformar conhecimento em conteúdo orgânico com mais consistência.",
      audience: "Especialistas que vendem conhecimento",
      offer: "um fluxo de briefing, roteiro e vídeo profissional",
      tone: ["didático", "confiante"],
      durationSeconds: 30,
      cta: "Conheça o método Besorah.",
    });

    expect(input.durationSeconds).toBe(30);
  });

  it("normalizes researched patterns into safe selectable candidates", () => {
    const candidates = researchToCandidates({
      search_summary: "Uma referência pública foi encontrada para análise de padrão.",
      patterns: [
        {
          source_url: "https://www.instagram.com/reel/example/",
          platform: "instagram",
          content_type: "organic",
          pattern: "Gancho de contraste seguido de explicação curta e uma conclusão contextual.",
          observed_hook: "Contraste entre erro comum e alternativa.",
          observed_visual_pattern: "Close no apresentador e palavras-chave grandes.",
          evidence: "A fonte pública permite verificar o formato, mas não informa métricas confiáveis.",
          public_metrics: { views: "unknown", likes: "unknown", comments: "unknown", shares: "unknown" },
          adaptation_guardrail: "Usar somente a lógica de contraste com texto e cenas próprios.",
        },
      ],
    });

    const response = referenceDiscoveryResponseSchema.parse({
      mode: "real",
      summary: "Pesquisa concluída com uma referência pública.",
      candidates,
      metadata: { model: "test", latencyMs: 1, estimatedCost: 0 },
    });

    expect(response.candidates[0]).toMatchObject({
      id: "research-1",
      rightsOrPermission: "public_reference",
      observedVisualPattern: "Close no apresentador e palavras-chave grandes.",
    });
  });
});
