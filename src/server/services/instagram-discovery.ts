import { z } from "zod";

import { getInstagramProvider } from "@/server/providers/instagram";
import type { InstagramReel } from "@/server/providers/instagram";

import { referenceCandidateSchema } from "./reference-discovery";

export const instagramDiscoveryInputSchema = z.object({
  query: z.string().trim().min(3).max(180).default("Instagram content creation"),
  limit: z.number().int().min(1).max(10).default(10),
});

const instagramReelUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (host === "instagram.com" || host === "www.instagram.com") && /^\/(reel|p)\//.test(url.pathname);
  }, "Informe um link publico de Reel do Instagram.");

export const instagramLinkAnalysisInputSchema = z.object({
  reelUrl: instagramReelUrlSchema,
});

const metricsSchema = z.object({
  views: z.number().nullable(),
  plays: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
});

export const instagramReferenceCandidateSchema = referenceCandidateSchema.extend({
  rank: z.number().int().positive().max(10).optional(),
  metrics: metricsSchema,
  durationSeconds: z.number().nullable(),
  publishedAt: z.string().nullable(),
  hasPublicCaption: z.boolean(),
  hasPublicTranscript: z.boolean(),
});

export const instagramDiscoveryResponseSchema = z.object({
  mode: z.enum(["mock", "real"]),
  query: z.string(),
  rankingBasis: z.string(),
  candidates: z.array(instagramReferenceCandidateSchema).min(1).max(10),
});

export const instagramLinkAnalysisResponseSchema = z.object({
  mode: z.enum(["mock", "real"]),
  analysisSummary: z.string(),
  candidate: instagramReferenceCandidateSchema,
});

export type InstagramReferenceCandidate = z.infer<typeof instagramReferenceCandidateSchema>;
export type InstagramDiscoveryResponse = z.infer<typeof instagramDiscoveryResponseSchema>;
export type InstagramLinkAnalysisResponse = z.infer<typeof instagramLinkAnalysisResponseSchema>;

function formatMetric(value: number | null): string {
  return value === null ? "indisponivel" : new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function performanceScore(reel: InstagramReel): number {
  const reach = reel.plays ?? reel.views ?? 0;
  const engagement = (reel.likes ?? 0) + (reel.comments ?? 0) * 3 + (reel.shares ?? 0) * 5;
  return reach * 100 + engagement;
}

function sentenceCount(reel: InstagramReel): string {
  if (reel.durationSeconds === null) return "DuraÃ§Ã£o nÃ£o disponibilizada pela publicaÃ§Ã£o.";
  return `DuraÃ§Ã£o pÃºblica de aproximadamente ${Math.round(reel.durationSeconds)} segundos.`;
}

function toCandidate(reel: InstagramReel, idPrefix: string, rank?: number): InstagramReferenceCandidate {
  const metrics = {
    views: reel.views,
    plays: reel.plays,
    likes: reel.likes,
    comments: reel.comments,
    shares: reel.shares,
  };
  return {
    id: `${idPrefix}-${reel.id}`.slice(0, 80),
    sourceUrl: reel.sourceUrl,
    platform: "instagram",
    creatorOrBrand: reel.creatorOrBrand,
    observedHook: "Abertura de alta tensÃ£o com promessa especÃ­fica; crie uma formulaÃ§Ã£o nova para a Besorah.",
    observedStructure: `${sentenceCount(reel)} Adaptar apenas a cadÃªncia abstrata: tensÃ£o inicial â†’ explicaÃ§Ã£o objetiva â†’ exemplo prÃ³prio â†’ CTA contextual.`,
    observedVisualPattern: reel.width && reel.height
      ? `Formato vertical pÃºblico ${reel.width}x${reel.height}. Use apresentador, legendas e B-roll prÃ³prios; os metadados nÃ£o autorizam reproduzir cenas ou identidade visual.`
      : "Formato de Reel pÃºblico. Use apresentador, legendas e B-roll prÃ³prios; nÃ£o recrie cenas, enquadramentos ou identidade visual.",
    performanceSignal: `MÃ©tricas pÃºblicas observadas: reproduÃ§Ãµes ${formatMetric(reel.plays)}, visualizaÃ§Ãµes ${formatMetric(reel.views)}, curtidas ${formatMetric(reel.likes)}, comentÃ¡rios ${formatMetric(reel.comments)} e compartilhamentos ${formatMetric(reel.shares)}.`,
    adaptationGuardrail: "Use somente o princÃ­pio de ritmo e progressÃ£o. NÃ£o reutilize texto, fala, transcriÃ§Ã£o, Ã¡udio, cenas, enquadramentos, marca ou rosto da referÃªncia.",
    rightsOrPermission: "public_reference",
    ...(rank === undefined ? {} : { rank }),
    metrics,
    durationSeconds: reel.durationSeconds,
    publishedAt: reel.publishedAt,
    hasPublicCaption: reel.caption !== "Legenda publica nao disponivel.",
    hasPublicTranscript: reel.transcript !== null,
  };
}

export async function discoverInstagramReferences(input: unknown): Promise<InstagramDiscoveryResponse> {
  const parsed = instagramDiscoveryInputSchema.parse(input);
  const provider = getInstagramProvider();
  const reels = await provider.discoverPopularReels(parsed);
  const candidates = reels
    .sort((left, right) => performanceScore(right) - performanceScore(left))
    .slice(0, parsed.limit)
    .map((reel, index) => toCandidate(reel, "instagram-radar", index + 1));
  if (candidates.length === 0) {
    throw new Error("Nenhum Reel pÃºblico foi retornado para este tema. Ajuste a busca e tente novamente.");
  }
  return instagramDiscoveryResponseSchema.parse({
    mode: provider.mode,
    query: parsed.query,
    rankingBasis: "Top 10 entre os Reels pÃºblicos retornados pela busca Popular do Instagram, ordenados por reproduÃ§Ãµes/visualizaÃ§Ãµes e sinais de engajamento disponÃ­veis.",
    candidates,
  });
}

export async function analyzeInstagramLink(input: unknown): Promise<InstagramLinkAnalysisResponse> {
  const parsed = instagramLinkAnalysisInputSchema.parse(input);
  const provider = getInstagramProvider();
  const reel = await provider.analyzeReel(parsed.reelUrl);
  return instagramLinkAnalysisResponseSchema.parse({
    mode: provider.mode,
    analysisSummary: reel.transcript
      ? "A publicaÃ§Ã£o pÃºblica foi mapeada com metadados, legenda e transcriÃ§Ã£o. O roteiro receberÃ¡ somente uma abstraÃ§Ã£o de estrutura para preservar originalidade."
      : "A publicaÃ§Ã£o pÃºblica foi mapeada com metadados e legenda quando disponÃ­vel. A transcriÃ§Ã£o nÃ£o foi retornada; a adaptaÃ§Ã£o segue apenas sinais estruturais.",
    candidate: toCandidate(reel, "instagram-link"),
  });
}
