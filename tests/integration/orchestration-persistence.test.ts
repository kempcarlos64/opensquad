import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FinalScript } from "@/lib/domain";
import { closeDatabaseForTests } from "@/server/db/client";
import { createProject, getProjectDetail } from "@/server/db/repository";
import { resetEnvForTests } from "@/server/env";
import { generateScriptsForProject } from "@/server/orchestration/generate-scripts";
import { MockScriptProvider } from "@/server/providers/scripts/mock";
import type { ScriptProvider } from "@/server/providers/scripts/types";

let temporaryRoot = "";

beforeEach(async () => {
  closeDatabaseForTests();
  resetEnvForTests();
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "besorah-db-"));
  const databasePath = path.join(temporaryRoot, "test.db");
  process.env.DATABASE_URL = databasePath;
  const database = new Database(databasePath);
  database.exec(
    await fs.readFile(path.resolve(process.cwd(), "migrations/0000_organic_video_lab.sql"), "utf8"),
  );
  database.close();
});

afterEach(async () => {
  closeDatabaseForTests();
  resetEnvForTests();
  delete process.env.DATABASE_URL;
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

describe("script orchestration persistence", () => {
  it("runs three writers per round and falls back to human review after two retries", async () => {
    const mock = new MockScriptProvider();
    const provider: ScriptProvider = {
      mode: "mock",
      candidateModel: mock.candidateModel,
      judgeModel: mock.judgeModel,
      generateCandidate: mock.generateCandidate.bind(mock),
      judge: async (brief, candidates, round) => {
        const judged = await mock.judge(brief, candidates, round);
        return {
          ...judged,
          output: { ...judged.output, decision: "retry" } satisfies FinalScript,
        };
      },
    };
    const project = await createProject({
      title: "Retry auditado",
      avatarId: "mock-avatar",
      voiceId: "mock-voice",
      brief: {
        objective: "Validar o limite de novas rodadas do juiz",
        audience: "Equipe Besorah",
        offer: "um processo de conteúdo revisável",
        tone: ["claro"],
        duration_seconds: 30,
        cta: "Revise o resultado",
        source_patterns: [],
        allowed_claims: [],
        forbidden_claims: [],
        brand_context: { company: "Besorah", positioning: "Conteúdo profissional" },
        language: "pt-BR",
      },
    });

    const final = await generateScriptsForProject(project.id, provider);
    const detail = await getProjectDetail(project.id);

    expect(final.decision).toBe("human_review");
    expect(detail?.candidates).toHaveLength(9);
    expect(detail?.convergence).toHaveLength(3);
    expect(detail?.convergence.map(({ version }) => version)).toEqual([1, 2, 3]);
    expect(detail?.project.status).toBe("human_review");
  });
});
