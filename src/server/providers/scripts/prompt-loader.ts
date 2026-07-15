import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { AgentType } from "@/lib/domain";

const promptByAgent: Record<AgentType, string> = {
  retention: "roteirista_a_retencao.md",
  conversion: "roteirista_b_conversao.md",
  naturalness: "roteirista_c_naturalidade.md",
};

export async function loadAgentPrompt(agent: AgentType) {
  return loadPrompt(promptByAgent[agent]);
}

export async function loadJudgePrompt() {
  return loadPrompt("juiz_convergencia.md");
}

async function loadPrompt(name: string) {
  const content = await fs.readFile(path.resolve(process.cwd(), "prompts", name), "utf8");
  const version = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return { content, version };
}
