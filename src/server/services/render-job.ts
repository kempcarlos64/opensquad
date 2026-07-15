import { spawn } from "node:child_process";
import path from "node:path";

import { buildRenderTimeline } from "@/remotion/timeline";
import {
  addAuditEvent,
  getProject,
  getVideoJob,
  updateProject,
  updateVideoJob,
} from "@/server/db/repository";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { getStorage } from "@/server/storage/local";

function runExternalWorker(jobId: string): Promise<void> {
  const cli = path.resolve(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const script = path.resolve(process.cwd(), "scripts", "render-job.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, script, jobId], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf8").trim();
      if (line) logger.info("remotion.worker", { jobId, output: line.slice(-1_000) });
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Remotion worker exited with code ${String(code)}`));
    });
  });
}

export async function renderProjectVideo(projectId: string) {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (!project.finalScriptJson) throw new Error("O projeto ainda não possui roteiro final.");
  const details = await import("@/server/db/repository").then(({ getProjectDetail }) =>
    getProjectDetail(projectId),
  );
  const job = details?.jobs.find((candidate) => candidate.storedSourcePath);
  if (!job?.storedSourcePath) throw new Error("O vídeo-base ainda não está disponível.");
  if (job.finalVideoPath && job.srtPath) return job;

  const providerDuration = Number(job.responseJson?.durationSeconds ?? 0);
  const durationSeconds = providerDuration > 0
    ? providerDuration
    : getEnv().MOCK_VIDEO_DURATION_SECONDS;
  const sourcePath = getStorage().resolve(job.storedSourcePath);
  const timeline = buildRenderTimeline({
    baseVideoUrl: sourcePath,
    script: project.finalScriptJson,
    durationMs: Math.round(durationSeconds * 1_000),
    title: project.title,
    cta: project.finalScriptJson.cta,
  });
  await updateVideoJob(job.id, { timelineJson: timeline });
  await updateProject(project.id, { status: "rendering" });
  await addAuditEvent(project.id, "render.started", { jobId: job.id });

  try {
    await runExternalWorker(job.id);
    await addAuditEvent(project.id, "render.completed", { jobId: job.id });
    return getVideoJob(job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no worker Remotion.";
    await updateVideoJob(job.id, { errorMessage: message });
    await updateProject(project.id, { status: "failed" });
    await addAuditEvent(project.id, "render.failed", { jobId: job.id, message });
    throw error;
  }
}
