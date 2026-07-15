import fs from "node:fs";
import path from "node:path";

import { getEnv } from "@/server/env";

import { HeyGenProvider } from "./heygen-provider";
import { MockVideoProvider } from "./mock-video-provider";
import type { VideoProvider } from "./types";

let provider: VideoProvider | undefined;

export function getVideoProvider(): VideoProvider {
  if (provider) return provider;
  const env = getEnv();
  if (env.HEYGEN_REAL_CALLS_ENABLED) {
    if (!env.HEYGEN_API_KEY) {
      throw new Error("HEYGEN_API_KEY is required when HEYGEN_REAL_CALLS_ENABLED=true");
    }
    provider = new HeyGenProvider({
      apiKey: env.HEYGEN_API_KEY,
      baseUrl: env.HEYGEN_API_BASE,
      ...(env.HEYGEN_WEBHOOK_SECRET ? { webhookSecret: env.HEYGEN_WEBHOOK_SECRET } : {}),
      webhookMaxAgeSeconds: env.HEYGEN_WEBHOOK_MAX_AGE_SECONDS,
    });
    return provider;
  }

  const fixturePath = path.resolve(process.cwd(), env.STORAGE_ROOT, "mock", "heygen-base.mp4");
  provider = new MockVideoProvider({
    ...(fs.existsSync(fixturePath)
      ? { videoBytes: new Uint8Array(fs.readFileSync(fixturePath)) }
      : {}),
    ...(env.HEYGEN_WEBHOOK_SECRET ? { webhookSecret: env.HEYGEN_WEBHOOK_SECRET } : {}),
  });
  return provider;
}

export function resetVideoProviderForTests(): void {
  provider = undefined;
}
