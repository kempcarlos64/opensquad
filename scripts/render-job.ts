import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderTimelineSchema, type RenderTimeline } from "../src/lib/domain";
import { renderTimelineToFiles } from "../src/remotion/render";
import { closeDatabaseForTests } from "../src/server/db/client";
import {
  addAuditEvent,
  getVideoJob,
  updateProject,
  updateVideoJob,
} from "../src/server/db/repository";
import { getEnv } from "../src/server/env";
import { getStorage } from "../src/server/storage/local";

type RenderJobResult = {
  videoPath: string;
  srtPath: string;
  durationMs: number;
};

function log(
  level: "info" | "error",
  event: string,
  details: Record<string, unknown>,
): void {
  process.stdout.write(
    `${JSON.stringify({ level, event, at: new Date().toISOString(), ...details })}\n`,
  );
}

function timelineFromJson(value: unknown): RenderTimeline {
  if (
    value &&
    typeof value === "object" &&
    "timeline" in value &&
    (value as { timeline?: unknown }).timeline
  ) {
    return renderTimelineSchema.parse(
      (value as { timeline: unknown }).timeline,
    );
  }
  return renderTimelineSchema.parse(value);
}

function safePathSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/gu, "-")
      .replace(/^\.+/u, "")
      .slice(0, 100) || "video-job"
  );
}

async function renderTimelineFile(
  timelineFile: string,
  outputDirectory: string,
): Promise<RenderJobResult> {
  const json = JSON.parse(await readFile(timelineFile, "utf8")) as unknown;
  const timeline = timelineFromJson(json);
  const fileStem = path.basename(timelineFile, path.extname(timelineFile));
  let lastLoggedKey = "";
  return renderTimelineToFiles({
    timeline,
    outputDirectory,
    fileStem,
    concurrency: getEnv().REMOTION_CONCURRENCY,
    onProgress: ({ phase, progress, renderedFrames, encodedFrames }) => {
      const key = `${phase}:${Math.floor(progress * 20)}`;
      if (phase !== "completed" && key === lastLoggedKey) return;
      lastLoggedKey = key;
      log("info", "remotion.progress", {
        phase,
        progress: Math.round(progress * 1_000) / 1_000,
        renderedFrames,
        encodedFrames,
      });
    },
  });
}

async function renderDatabaseJob(
  jobId: string,
  outputDirectoryOverride?: string,
): Promise<RenderJobResult> {
  const job = await getVideoJob(jobId);

  if (!job) throw new Error(`Video job not found: ${jobId}`);
  if (
    job.finalVideoPath &&
    job.srtPath &&
    await getStorage().exists(job.finalVideoPath) &&
    await getStorage().exists(job.srtPath)
  ) {
    const timeline = renderTimelineSchema.parse(job.timelineJson);
    log("info", "remotion.job_reused", { jobId });
    return {
      videoPath: getStorage().resolve(job.finalVideoPath),
      srtPath: getStorage().resolve(job.srtPath),
      durationMs: timeline.durationMs,
    };
  }

  const storedSourcePath = job.storedSourcePath
    ? getStorage().resolve(job.storedSourcePath)
    : null;
  const timeline = renderTimelineSchema.parse(job.timelineJson);
  const renderTimeline =
    storedSourcePath && existsSync(storedSourcePath)
      ? { ...timeline, baseVideoUrl: storedSourcePath }
      : timeline;
  const outputDirectory = path.resolve(
    outputDirectoryOverride ?? getEnv().REMOTION_OUTPUT_DIR,
    safePathSegment(jobId),
  );

  await updateProject(job.projectId, { status: "rendering" });
  await addAuditEvent(
    job.projectId,
    "remotion.render_started",
    { jobId },
    `remotion:${jobId}:started`,
  );

  log("info", "remotion.job_started", { jobId, projectId: job.projectId });
  let lastLoggedBucket = -1;

  try {
    const result = await renderTimelineToFiles({
      timeline: renderTimeline,
      outputDirectory,
      fileStem: jobId,
      concurrency: getEnv().REMOTION_CONCURRENCY,
      onProgress: ({ phase, progress, renderedFrames, encodedFrames }) => {
        const bucket = Math.floor(progress * 20);
        if (phase !== "completed" && bucket === lastLoggedBucket) return;
        lastLoggedBucket = bucket;
        log("info", "remotion.progress", {
          jobId,
          phase,
          progress: Math.round(progress * 1_000) / 1_000,
          renderedFrames,
          encodedFrames,
        });
      },
    });

    const finalVideoKey = `${job.projectId}/final/${safePathSegment(jobId)}.mp4`;
    const finalSrtKey = `${job.projectId}/final/${safePathSegment(jobId)}.srt`;
    await Promise.all([
      getStorage().putFile(finalVideoKey, result.videoPath),
      getStorage().putFile(finalSrtKey, result.srtPath),
    ]);
    await updateVideoJob(jobId, {
      finalVideoPath: finalVideoKey,
      srtPath: finalSrtKey,
      errorMessage: "",
    });
    await updateProject(job.projectId, { status: "completed" });
    await addAuditEvent(
      job.projectId,
      "remotion.render_completed",
      {
        jobId,
        videoPath: finalVideoKey,
        srtPath: finalSrtKey,
        durationMs: result.durationMs,
      },
      `remotion:${jobId}:completed`,
    );
    log("info", "remotion.job_completed", { jobId, ...result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateVideoJob(jobId, { errorMessage: message });
    await updateProject(job.projectId, { status: "failed" });
    await addAuditEvent(job.projectId, "remotion.render_failed", {
      jobId,
      message,
    });
    log("error", "remotion.job_failed", { jobId, message });
    throw error;
  }
}

async function main(): Promise<void> {
  const [target, outputDirectoryArg] = process.argv.slice(2);
  if (!target) {
    throw new Error(
      "Usage: tsx scripts/render-job.ts <jobId|timeline.json> [outputDirectory]",
    );
  }

  const targetPath = path.resolve(target);
  const outputDirectory = path.resolve(
    outputDirectoryArg ?? getEnv().REMOTION_OUTPUT_DIR,
  );
  const result = existsSync(targetPath) && path.extname(targetPath) === ".json"
    ? await renderTimelineFile(targetPath, outputDirectory)
    : await renderDatabaseJob(target, outputDirectoryArg);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabaseForTests();
  });
