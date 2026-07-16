import { getEnv } from "@/server/env";

import { ApifyInstagramProvider } from "./apify-instagram-provider";
import { MockInstagramProvider } from "./mock-instagram-provider";
import type { InstagramProvider } from "./types";

let cached: InstagramProvider | undefined;

export function getInstagramProvider(): InstagramProvider {
  if (cached) return cached;
  const env = getEnv();
  cached = env.APIFY_REAL_CALLS_ENABLED && env.APIFY_API_TOKEN
    ? new ApifyInstagramProvider()
    : new MockInstagramProvider();
  return cached;
}

export function resetInstagramProviderForTests(): void {
  cached = undefined;
}
