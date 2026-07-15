import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import type { AgentType, FinalScript, ScriptCandidate, VideoBrief } from "@/lib/domain";
import { finalScriptSchema, scriptCandidateSchema } from "@/lib/domain";
import { getEnv } from "@/server/env";

import { loadAgentPrompt, loadJudgePrompt } from "./prompt-loader";
import type { ProviderRun, ScriptProvider } from "./types";

function cost(input: number, output: number, inputPrice: number, outputPrice: number) {
  return (input / 1_000_000) * inputPrice + (output / 1_000_000) * outputPrice;
}

export class OpenAIScriptProvider implements ScriptProvider {
  readonly mode = "openai" as const;
  readonly candidateModel: string;
  readonly judgeModel: string;
  private readonly client: OpenAI;

  constructor() {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for real LLM calls");
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.candidateModel = env.SCRIPTWRITER_MODEL;
    this.judgeModel = env.JUDGE_MODEL;
  }

  async generateCandidate(
    agent: AgentType,
    brief: VideoBrief,
    round: number,
  ): Promise<ProviderRun<ScriptCandidate>> {
    const env = getEnv();
    const prompt = await loadAgentPrompt(agent);
    const started = performance.now();
    const response = await this.client.responses.parse({
      model: this.candidateModel,
      input: [
        { role: "system", content: prompt.content },
        { role: "user", content: JSON.stringify({ round, brief }) },
      ],
      text: { format: zodTextFormat(scriptCandidateSchema, "script_candidate") },
    });
    const parsed = scriptCandidateSchema.parse(response.output_parsed);
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return {
      output: parsed,
      metadata: {
        model: this.candidateModel,
        promptVersion: prompt.version,
        latencyMs: Math.round(performance.now() - started),
        inputTokens,
        outputTokens,
        estimatedCost: cost(
          inputTokens,
          outputTokens,
          env.SCRIPTWRITER_INPUT_PRICE_PER_MILLION,
          env.SCRIPTWRITER_OUTPUT_PRICE_PER_MILLION,
        ),
      },
    };
  }

  async judge(
    brief: VideoBrief,
    candidates: ScriptCandidate[],
    round: number,
  ): Promise<ProviderRun<FinalScript>> {
    const env = getEnv();
    const prompt = await loadJudgePrompt();
    const started = performance.now();
    const response = await this.client.responses.parse({
      model: this.judgeModel,
      input: [
        { role: "system", content: prompt.content },
        { role: "user", content: JSON.stringify({ round, brief, candidates }) },
      ],
      text: { format: zodTextFormat(finalScriptSchema, "final_script") },
    });
    const parsed = finalScriptSchema.parse(response.output_parsed);
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return {
      output: parsed,
      metadata: {
        model: this.judgeModel,
        promptVersion: prompt.version,
        latencyMs: Math.round(performance.now() - started),
        inputTokens,
        outputTokens,
        estimatedCost: cost(
          inputTokens,
          outputTokens,
          env.JUDGE_INPUT_PRICE_PER_MILLION,
          env.JUDGE_OUTPUT_PRICE_PER_MILLION,
        ),
      },
    };
  }
}
