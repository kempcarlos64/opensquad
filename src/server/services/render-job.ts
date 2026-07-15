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
import { logger } from "@/server/logger";
import {
  assertMediaQuality,
  finalVideoRequirements,
  MediaQualityError,
  sourceVideoRequirements,
} from "@/server/media/quality";
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

  const providerDuration = Number(job.responseJson?.durationSeconds ?? 0);
  const sourcePath = getStorage().resolve(job.storedSourcePath);

  try {
    const sourceMedia = await assertMediaQuality(
      sourcePath,
      sourceVideoRequirements(
        providerDuration > 0 ? Math.round(providerDuration * 1_000) : undefined,
      ),
    );

    if (job.finalVideoPath && job.srtPath) {
      const finalExists = await getStorage().exists(job.finalVideoPath);
      const srtExists = await getStorage().exists(job.srtPath);
      if (finalExists && srtExists) {
        try {
          const expectedDurationMs = job.timelineJson?.durationMs ?? sourceMedia.durationMs;
          const finalMedia = await assertMediaQuality(
            getStorage().resolve(job.finalVideoPath),
            finalVideoRequirements(expectedDurationMs),
          );
          await addAuditEvent(
            project.id,
            "render.reused_quality_passed",
            { jobId: job.id, finalMedia },
            `render:${job.id}:reuse_quality_passed`,
          );
          return job;
        } catch (error) {
          await updateVideoJob(job.id, {
            finalVideoPath: null,
            srtPath: null,
            errorMessage: error instanceof Error ? error.message : "Vídeo final inválido.",
          });
          await addAuditEvent(project.id, "render.reused_quality_failed", {
            jobId: job.id,
            ...(error instanceof MediaQualityError
              ? error.toAuditPayload()
              : { message: String(error) }),
          });
        }
      } else {
        await updateVideoJob(job.id, { finalVideoPath: null, srtPath: null });
      }
    }

    const timeline = buildRenderTimeline({
      baseVideoUrl: sourcePath,
      script: project.finalScriptJson,
      durationMs: sourceMedia.durationMs,
      title: project.title,
      cta: project.finalScriptJson.cta,
    });
    await updateVideoJob(job.id, { timelineJson: timeline, errorMessage: null });
    await updateProject(project.id, { status: "rendering" });
    await addAuditEvent(project.id, "render.started", {
      jobId: job.id,
      sourceMedia,
    });

    await runExternalWorker(job.id);
    const completedJob = await getVideoJob(job.id);
    if (!completedJob?.finalVideoPath || !completedJob.srtPath) {
      throw new Error("O worker terminou sem produzir um MP4 e um SRT validados.");
    }
    const finalMedia = await assertMediaQuality(
      getStorage().resolve(completedJob.finalVideoPath),
      finalVideoRequirements(timeline.durationMs),
    );
    await updateProject(project.id, { status: "completed" });
    await addAuditEvent(
      project.id,
      "render.completed",
      { jobId: job.id, finalMedia },
      `render:${job.id}:completed`,
    );
    return completedJob;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no worker Remotion.";
    const sourceQualityFailure =
      error instanceof MediaQualityError && error.stage === "source";
    await updateVideoJob(job.id, {
      ...(sourceQualityFailure
        ? { status: "failed" as const, storedSourcePath: null }
        : { finalVideoPath: null, srtPath: null }),
      errorMessage: message,
    });
    await updateProject(project.id, { status: "failed" });
    await addAuditEvent(project.id, "render.failed", {
      jobId: job.id,
      message,
      ...(error instanceof MediaQualityError ? error.toAuditPayload() : {}),
    });
    logger.error("render.quality_or_worker_failed", {
      projectId: project.id,
      jobId: job.id,
      message,
      ...(error instanceof MediaQualityError
        ? { code: error.code, stage: error.stage }
        : {}),
    });
    throw error;
  }
}
