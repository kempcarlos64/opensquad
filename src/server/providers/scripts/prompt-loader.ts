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
  return loadPrompt(promptByAgent[agent], "quality_rubric.md");
}

export async function loadJudgePrompt() {
  return loadPrompt("juiz_convergencia.md", "quality_rubric.md");
}

export async function loadResearchPrompt() {
  return loadPrompt("pesquisador_reels.md");
}

async function loadPrompt(...names: string[]) {
  const parts = await Promise.all(
    names.map((name) => fs.readFile(path.resolve(process.cwd(), "prompts", name), "utf8")),
  );
  const content = parts.join("\n\n---\n\n");
  const version = createHash("sha256").update(content).digest("hex").slice(0, 12);
  return { content, version };
}
