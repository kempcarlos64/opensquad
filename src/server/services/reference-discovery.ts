import { z } from "zod";

import type { RunMetadata, VideoBrief } from "@/lib/domain";
import { getEnv } from "@/server/env";
import {
  type ReelsResearch,
  researchReelsPatterns,
} from "@/server/providers/research/reels-research";

export const referenceDiscoveryInputSchema = z.object({
  objective: z.string().trim().min(8).max(500),
  audience: z.string().trim().min(3).max(300),
  offer: z.string().trim().min(3).max(500),
  tone: z.array(z.string().trim().min(2).max(60)).min(1).max(6),
  durationSeconds: z.number().int().min(15).max(60),
  cta: z.string().trim().min(3).max(240),
});

export const referenceCandidateSchema = z.object({
  id: z.string().min(1).max(80),
  sourceUrl: z.url(),
  platform: z.enum(["instagram", "meta", "youtube", "tiktok", "web"]),
  creatorOrBrand: z.string().min(1).max(160),
  observedHook: z.string().min(2).max(500),
  observedStructure: z.string().min(20).max(1_000),
  observedVisualPattern: z.string().min(2).max(1_000),
  performanceSignal: z.string().min(2).max(700),
  adaptationGuardrail: z.string().min(10).max(1_000),
  rightsOrPermission: z.literal("public_reference"),
});

export const referenceDiscoveryResponseSchema = z.object({
  mode: z.enum(["mock", "real"]),
  summary: z.string().min(10).max(1_500),
  candidates: z.array(referenceCandidateSchema).min(1).max(8),
  metadata: z.object({
    model: z.string(),
    latencyMs: z.number().int().nonnegative(),
    estimatedCost: z.number().nonnegative(),
  }),
});

export type ReferenceDiscoveryInput = z.infer<typeof referenceDiscoveryInputSchema>;
export type ReferenceCandidate = z.infer<typeof referenceCandidateSchema>;
export type ReferenceDiscoveryResponse = z.infer<typeof referenceDiscoveryResponseSchema>;

function researchToCandidates(report: ReelsResearch): ReferenceCandidate[] {
  return report.patterns.map((pattern, index) => ({
    id: `research-${index + 1}`,
    sourceUrl: pattern.source_url,
    platform: pattern.platform,
    creatorOrBrand: "Referência pública",
    observedHook: pattern.observed_hook ?? "Gancho descrito na evidência pública.",
    observedStructure: pattern.pattern,
    observedVisualPattern: pattern.observed_visual_pattern ?? "Confirmar o padrão visual no vídeo selecionado.",
    performanceSignal: [
      pattern.evidence,
      `Métricas públicas: ${JSON.stringify(pattern.public_metrics)}.`,
    ].join(" ").slice(0, 700),
    adaptationGuardrail: pattern.adaptation_guardrail,
    rightsOrPermission: "public_reference",
  }));
}

function mockCandidates(input: ReferenceDiscoveryInput): ReferenceCandidate[] {
  const audience = input.audience.toLocaleLowerCase("pt-BR");
  return [
    {
      id: "mock-contrast-hook",
      sourceUrl: "https://www.instagram.com/reel/placeholder-contrast/",
      platform: "instagram",
      creatorOrBrand: "Referência demonstrativa",
      observedHook: "Contraste explícito entre a tentativa comum e o método mais simples nos primeiros dois segundos.",
      observedStructure: "Dor reconhecível → contraste visual → explicação curta do mecanismo → prova de processo → CTA contextual.",
      observedVisualPattern: "Apresentador em close, cortes por mudança de ideia, palavras-chave grandes e B-roll apenas para reforçar a tese.",
      performanceSignal: "Exemplo mock: valide visualizações, data e contexto diretamente no post antes de adotá-lo como benchmark.",
      adaptationGuardrail: `Aplicar o contraste ao contexto de ${audience}, com texto, cena, marca e fala totalmente originais.`,
      rightsOrPermission: "public_reference",
    },
    {
      id: "mock-list-payoff",
      sourceUrl: "https://www.instagram.com/reel/placeholder-list/",
      platform: "instagram",
      creatorOrBrand: "Referência demonstrativa",
      observedHook: "Promessa específica de três pontos, seguida da entrega do ponto menos óbvio primeiro.",
      observedStructure: "Promessa verificável → lista progressiva → microvirada no último item → síntese → CTA sem quebra brusca.",
      observedVisualPattern: "Números na tela, enquadramento estável, cortes discretos e legendas em blocos curtos acompanhando a fala.",
      performanceSignal: "Exemplo mock: métricas e alcance são desconhecidos até confirmação humana na publicação original.",
      adaptationGuardrail: "Usar apenas a arquitetura de progressão; não reutilizar frases, exemplos, áudio, cenas ou identidade da referência.",
      rightsOrPermission: "public_reference",
    },
    {
      id: "mock-demo-process",
      sourceUrl: "https://www.instagram.com/reel/placeholder-process/",
      platform: "instagram",
      creatorOrBrand: "Referência demonstrativa",
      observedHook: "Pergunta direta que mostra uma pequena falha de processo antes de apresentar a solução.",
      observedStructure: "Pergunta → demonstração breve do atrito → antes/depois conceitual → passo aplicável → convite para continuar.",
      observedVisualPattern: "Tela dividida ou B-roll de trabalho, título curto no topo e transições sem efeitos chamativos.",
      performanceSignal: "Exemplo mock: use a página pública apenas como ponto de partida e registre sinais verificáveis antes de decidir.",
      adaptationGuardrail: "Transformar o mecanismo em demonstração própria da Besorah; não recriar enquadramento, sequência ou roteiro quadro a quadro.",
      rightsOrPermission: "public_reference",
    },
  ];
}

function toBrief(input: ReferenceDiscoveryInput): VideoBrief {
  return {
    objective: input.objective,
    audience: input.audience,
    offer: input.offer,
    tone: input.tone,
    duration_seconds: input.durationSeconds,
    cta: input.cta,
    source_patterns: [],
    allowed_claims: [],
    forbidden_claims: [],
    brand_context: {
      company: "Besorah",
      positioning: "Conhecimento transformado em conteúdo orgânico profissional.",
    },
    language: "pt-BR",
  };
}

function mockMetadata(): RunMetadata {
  return {
    model: "mock-reference-scout-v1",
    promptVersion: "mock",
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  };
}

export async function discoverReferenceCandidates(
  input: ReferenceDiscoveryInput,
): Promise<ReferenceDiscoveryResponse> {
  const parsed = referenceDiscoveryInputSchema.parse(input);
  const env = getEnv();

  if (env.LLM_REAL_CALLS_ENABLED && env.REELS_RESEARCH_ENABLED && env.OPENAI_API_KEY) {
    try {
      const run = await researchReelsPatterns(toBrief(parsed));
      return referenceDiscoveryResponseSchema.parse({
        mode: "real",
        summary: run.report.search_summary,
        candidates: researchToCandidates(run.report),
        metadata: {
          model: run.metadata.model,
          latencyMs: run.metadata.latencyMs,
          estimatedCost: run.metadata.estimatedCost,
        },
      });
    } catch {
      // Research must not prevent a user from choosing their own references or
      // continuing in mock mode when an external provider is unavailable.
      const metadata = mockMetadata();
      return referenceDiscoveryResponseSchema.parse({
        mode: "mock",
        summary: "A pesquisa externa está indisponível neste momento. Exibimos formatos demonstrativos; tente novamente ou adicione links públicos manualmente.",
        candidates: mockCandidates(parsed),
        metadata: {
          model: metadata.model,
          latencyMs: metadata.latencyMs,
          estimatedCost: metadata.estimatedCost,
        },
      });
    }
  }

  const metadata = mockMetadata();
  return referenceDiscoveryResponseSchema.parse({
    mode: "mock",
    summary: "Modo demonstrativo: as referências abaixo explicam formatos que serão pesquisados de verdade quando a pesquisa externa estiver habilitada.",
    candidates: mockCandidates(parsed),
    metadata: {
      model: metadata.model,
      latencyMs: metadata.latencyMs,
      estimatedCost: metadata.estimatedCost,
    },
  });
}

export { researchToCandidates };
