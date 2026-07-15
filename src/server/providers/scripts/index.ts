import { getEnv } from "@/server/env";

import { MockScriptProvider } from "./mock";
import { OpenAIScriptProvider } from "./openai";
import type { ScriptProvider } from "./types";

export function getScriptProvider(): ScriptProvider {
  const env = getEnv();
  if (env.LLM_REAL_CALLS_ENABLED) return new OpenAIScriptProvider();
  return new MockScriptProvider();
}

export type { ScriptProvider } from "./types";
