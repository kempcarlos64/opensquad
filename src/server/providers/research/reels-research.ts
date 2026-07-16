import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { RunMetadata, VideoBrief } from "@/lib/domain";
import { getEnv } from "@/server/env";

import { loadResearchPrompt } from "../scripts/prompt-loader";

const researchPatternSchema = z.object({
  source_url: z.url(),
  platform: z.enum(["instagram", "meta", "youtube", "tiktok", "web"]),
  content_type: z.enum(["organic", "ad", "official_guidance", "unknown"]),
  pattern: z.string().min(20).max(800),
  observed_hook: z.string().min(2).max(500).nullable(),
  observed_visual_pattern: z.string().min(2).max(1_000).nullable(),
  evidence: z.string().min(10).max(800),
  public_metrics: z.object({
    views: z.union([z.number().int().nonnegative(), z.literal("unknown")]),
    likes: z.union([z.number().int().nonnegative(), z.literal("unknown")]),
    comments: z.union([z.number().int().nonnegative(), z.literal("unknown")]),
    shares: z.union([z.number().int().nonnegative(), z.literal("unknown")]),
  }),
  adaptation_guardrail: z.string().min(10).max(500),
});

export const reelsResearchSchema = z.object({
  search_summary: z.string().min(20).max(1_500),
  patterns: z.array(researchPatternSchema).min(1).max(8),
});

export type ReelsResearch = z.infer<typeof reelsResearchSchema>;

export type ReelsResearchRun = {
  report: ReelsResearch;
  enrichedBrief: VideoBrief;
  metadata: RunMetadata;
};

function estimatedCost(inputTokens: number, outputTokens: number) {
  const env = getEnv();
  return (
    (inputTokens / 1_000_000) * env.RESEARCH_INPUT_PRICE_PER_MILLION +
    (outputTokens / 1_000_000) * env.RESEARCH_OUTPUT_PRICE_PER_MILLION
  );
}

export async function researchReelsPatterns(brief: VideoBrief): Promise<ReelsResearchRun> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for Reels research");

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const prompt = await loadResearchPrompt();
  const started = performance.now();
  const response = await client.responses.parse({
    model: env.RESEARCH_MODEL,
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: prompt.content },
      { role: "user", content: JSON.stringify({ brief, market: "Brasil", language: "pt-BR" }) },
    ],
    text: { format: zodTextFormat(reelsResearchSchema, "reels_research") },
  });
  const report = reelsResearchSchema.parse(response.output_parsed);
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return {
    report,
    enrichedBrief: {
      ...brief,
      source_patterns: [
        ...brief.source_patterns.slice(0, 6),
        ...report.patterns.map((pattern, index) => ({
          id: `research-${index + 1}`,
          description: pattern.pattern,
          source_type: pattern.platform === "instagram" || pattern.platform === "youtube"
            ? ("video" as const)
            : ("other" as const),
          source_url: pattern.source_url,
          observed_structure: pattern.pattern,
          performance_signal: [
            pattern.evidence,
            `Métricas públicas: ${JSON.stringify(pattern.public_metrics)}.`,
          ].join(" ").slice(0, 500),
          adaptation_guardrail: pattern.adaptation_guardrail,
          rights_or_permission: "public_reference" as const,
        })),
      ].slice(0, 12),
    },
    metadata: {
      model: env.RESEARCH_MODEL,
      promptVersion: prompt.version,
      latencyMs: Math.round(performance.now() - started),
      inputTokens,
      outputTokens,
      estimatedCost: estimatedCost(inputTokens, outputTokens),
    },
  };
}
