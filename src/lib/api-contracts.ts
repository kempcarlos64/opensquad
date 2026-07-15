import { z } from "zod";

import { finalScriptSchema, videoBriefSchema } from "./domain";

export const createProjectRequestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  brief: videoBriefSchema,
  avatarId: z.string().min(1).max(200),
  voiceId: z.string().min(1).max(200),
});

export const updateProjectRequestSchema = z.object({
  finalScript: finalScriptSchema,
});

export const createVideoRequestSchema = z.object({
  avatarId: z.string().min(1).max(200),
  voiceId: z.string().min(1).max(200),
  retryFailed: z.boolean().default(false),
});

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
