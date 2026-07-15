import type {
  AgentType,
  FinalScript,
  RunMetadata,
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
  ): Promise<ProviderRun<ScriptCandidate>>;
  judge(
    brief: VideoBrief,
    candidates: ScriptCandidate[],
    round: number,
  ): Promise<ProviderRun<FinalScript>>;
}
