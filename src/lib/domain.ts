import { z } from "zod";

export const agentTypeSchema = z.enum([
  "retention",
  "conversion",
  "naturalness",
]);

export const videoBriefSchema = z.object({
  objective: z.string().trim().min(8).max(500),
  audience: z.string().trim().min(3).max(300),
  offer: z.string().trim().min(3).max(500),
  tone: z.array(z.string().trim().min(2).max(60)).min(1).max(6),
  duration_seconds: z.number().int().min(15).max(60),
  cta: z.string().trim().min(3).max(240),
  source_patterns: z
    .array(
      z.object({
        description: z.string().trim().min(2).max(500),
      }),
    )
    .max(12),
  allowed_claims: z.array(z.string().trim().min(2).max(500)).max(20),
  forbidden_claims: z.array(z.string().trim().min(2).max(500)).max(20),
  brand_context: z.object({
    company: z.string().trim().min(2).max(120),
    positioning: z.string().trim().max(500),
  }),
  language: z.literal("pt-BR"),
});

export const scoreSetSchema = z.object({
  hook: z.number().min(0).max(10),
  retention: z.number().min(0).max(10),
  clarity: z.number().min(0).max(10),
  brand: z.number().min(0).max(10),
  conversion: z.number().min(0).max(10),
  naturalness: z.number().min(0).max(10),
  factual_safety: z.number().min(0).max(10),
});

export const scriptCandidateSchema = z.object({
  agent: agentTypeSchema,
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(300),
  spoken_script: z.string().min(20).max(5_000),
  cta: z.string().min(1).max(300),
  estimated_seconds: z.number().min(10).max(90),
  scene_beats: z.array(
    z.object({
      order: z.number().int().min(1),
      spoken: z.string().min(1).max(800),
      visual: z.string().min(1).max(500),
    }),
  ),
  scores: scoreSetSchema,
  risk_flags: z.array(z.string().max(300)),
  reasoning_summary: z.string().min(1).max(1_000),
});

export const finalScriptSchema = z.object({
  decision: z.enum(["approved", "retry", "human_review"]),
  final_score: z.number().min(0).max(100),
  agreement_score: z.number().min(0).max(100),
  hook: z.string().min(1).max(300),
  spoken_script: z.string().min(20).max(5_000),
  cta: z.string().min(1).max(300),
  scene_plan: z.array(
    z.object({
      order: z.number().int().min(1),
      spoken: z.string().min(1).max(800),
      visual: z.string().min(1).max(500),
      duration_seconds: z.number().min(0.25).max(60),
    }),
  ),
  fact_checks: z.array(
    z.object({
      claim: z.string().min(1).max(500),
      status: z.enum(["supported", "removed", "needs_review"]),
      rationale: z.string().min(1).max(500),
    }),
  ),
  selected_elements: z.array(
    z.object({
      agent: agentTypeSchema,
      element: z.string().min(1).max(120),
      rationale: z.string().min(1).max(500),
    }),
  ),
  rejection_reasons: z.array(z.string().max(500)),
});

export const captionSchema = z.object({
  text: z.string(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  timestampMs: z.number().int().min(0),
  confidence: z.number().min(0).max(1).nullable(),
});

export const timelineOverlaySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["title", "logo", "broll", "cta"]),
  fromMs: z.number().int().min(0),
  toMs: z.number().int().positive(),
  text: z.string(),
  assetUrl: z.string().nullable(),
});

export const renderTimelineSchema = z.object({
  version: z.literal(1),
  durationMs: z.number().int().positive(),
  baseVideoUrl: z.string().min(1),
  captions: z.array(captionSchema),
  overlays: z.array(timelineOverlaySchema),
  theme: z.object({
    background: z.string(),
    foreground: z.string(),
    accent: z.string(),
    safeAreaPx: z.number().int().min(80).max(300),
  }),
});

export const videoPlanSchema = z.object({
  title: z.string().min(1).max(120),
  script: z.string().min(1).max(5_000),
  avatarId: z.string().min(1),
  voiceId: z.string().min(1),
  resolution: z.literal("1080p"),
  aspectRatio: z.literal("9:16"),
  outputFormat: z.literal("mp4"),
  callbackId: z.string().min(1),
  engine: z.string().nullable(),
});

export const projectStatusSchema = z.enum([
  "draft",
  "scripts_ready",
  "human_review",
  "video_queued",
  "video_processing",
  "base_ready",
  "rendering",
  "completed",
  "failed",
]);

export const videoJobStatusSchema = z.enum([
  "queued",
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export type AgentType = z.infer<typeof agentTypeSchema>;
export type VideoBrief = z.infer<typeof videoBriefSchema>;
export type ScriptCandidate = z.infer<typeof scriptCandidateSchema>;
export type FinalScript = z.infer<typeof finalScriptSchema>;
export type RenderTimeline = z.infer<typeof renderTimelineSchema>;
export type VideoPlan = z.infer<typeof videoPlanSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type VideoJobStatus = z.infer<typeof videoJobStatusSchema>;

export type RunMetadata = {
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};
