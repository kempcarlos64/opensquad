import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const envSchema = z.object({
  APP_URL: z.url().default("http://127.0.0.1:3000"),
  DATABASE_URL: z.string().min(1).default("./data/besorah.db"),
  STORAGE_ROOT: z.string().min(1).default("./data/storage"),
  OPENAI_API_KEY: z.string().optional(),
  SCRIPTWRITER_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  JUDGE_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  LLM_REAL_CALLS_ENABLED: booleanFromString,
  SCRIPTWRITER_INPUT_PRICE_PER_MILLION: z.coerce.number().min(0).default(0),
  SCRIPTWRITER_OUTPUT_PRICE_PER_MILLION: z.coerce.number().min(0).default(0),
  JUDGE_INPUT_PRICE_PER_MILLION: z.coerce.number().min(0).default(0),
  JUDGE_OUTPUT_PRICE_PER_MILLION: z.coerce.number().min(0).default(0),
  HEYGEN_API_KEY: z.string().optional(),
  HEYGEN_API_BASE: z.url().default("https://api.heygen.com"),
  HEYGEN_WEBHOOK_SECRET: z.string().optional(),
  HEYGEN_WEBHOOK_SETUP_MODE: booleanFromString,
  HEYGEN_REAL_CALLS_ENABLED: booleanFromString,
  HEYGEN_WEBHOOK_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
  REMOTION_CONCURRENCY: z.coerce.number().int().positive().default(1),
  REMOTION_OUTPUT_DIR: z.string().min(1).default("./data/renders"),
  MOCK_VIDEO_DURATION_SECONDS: z.coerce.number().min(3).max(60).default(8),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  cached ??= envSchema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
