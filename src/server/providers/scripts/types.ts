import type {
  AgentType,
  FinalScript,
  RunMetadata,
  RetryDirective,
  ScriptCandidate,
  VideoBrief,
} from "@/lib/domain";

export type ProviderRun<T> = {
  output: T;
  metadata: RunMetadata;
};

export interface ScriptProvider {
  readonly mode: "mock" | "openai";
  readonly candidateModel: string;
  readonly judgeModel: string;
  generateCandidate(
    agent: AgentType,
    brief: VideoBrief,
    round: number,
    retryDirective: RetryDirective | null,
  ): Promise<ProviderRun<ScriptCandidate>>;
  judge(
    brief: VideoBrief,
    candidates: ScriptCandidate[],
    round: number,
  ): Promise<ProviderRun<FinalScript>>;
}
