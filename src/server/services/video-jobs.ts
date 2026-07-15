import { createHash } from "node:crypto";

import type { VideoJobStatus, VideoPlan } from "@/lib/domain";
import {
  addAuditEvent,
  createVideoJob,
  getAuditEventByKey,
  getProject,
  getProjectDetail,
  getVideoJob,
  getVideoJobByProviderId,
  updateProject,
  updateVideoJob,
} from "@/server/db/repository";
import { logger } from "@/server/logger";
import {
  assertMediaQuality,
  MediaQualityError,
  sourceVideoRequirements,
} from "@/server/media/quality";
import {
  getVideoProvider,
  VideoProviderHttpError,
  type VideoProvider,
  type VideoProviderStatus,
  type WebhookHeaders,
} from "@/server/providers/video";
import { getStorage } from "@/server/storage/local";

function databaseStatus(status: VideoProviderStatus): VideoJobStatus {
  return status;
}

function nextPollDate(attempt: number, retryAfterSeconds?: number | null) {
  const base = retryAfterSeconds === null || retryAfterSeconds === undefined
    ? Math.min(60_000, 1_000 * 2 ** Math.min(attempt, 6))
    : retryAfterSeconds * 1_000;
  const jitter = Math.round(base * Math.random() * 0.15);
  return new Date(Date.now() + base + jitter);
}

async function persistCompletedVideo(
  job: NonNullable<Awaited<ReturnType<typeof getVideoJob>>>,
  provider: VideoProvider,
) {
  if (!job.providerVideoId) throw new Error("Provider video id missing");
  const key = `${job.projectId}/source/${job.providerVideoId.replace(/[^A-Za-z0-9_.-]/g, "_")}.mp4`;
  const storage = getStorage();
  const expectedDurationSeconds = Number(job.responseJson?.durationSeconds ?? 0);
  const expectedDurationMs = expectedDurationSeconds > 0
    ? Math.round(expectedDurationSeconds * 1_000)
    : undefined;

  if (!job.storedSourcePath) {
    const download = await provider.downloadCompletedVideo(job.providerVideoId);
    await storage.putWebStream(key, download.body);
  }

  const storedKey = job.storedSourcePath ?? key;
  let media;
  try {
    media = await assertMediaQuality(
      storage.resolve(storedKey),
      sourceVideoRequirements(expectedDurationMs),
    );
  } catch (error) {
    const qualityError = error instanceof MediaQualityError
      ? error
      : new MediaQualityError(
        "source",
        [{ code: "media_probe_failed", message: "Falha ao validar o vídeo-base baixado." }],
        null,
        { cause: error },
      );
    await updateVideoJob(job.id, {
      status: "failed",
      storedSourcePath: null,
      errorMessage: qualityError.message,
    });
    await updateProject(job.projectId, { status: "failed" });
    await addAuditEvent(
      job.projectId,
      "video.quality_failed",
      { jobId: job.id, providerVideoId: job.providerVideoId, ...qualityError.toAuditPayload() },
      `video:${job.id}:quality_failed`,
    );
    logger.error("video.quality_failed", {
      projectId: job.projectId,
      jobId: job.id,
      code: qualityError.code,
      message: qualityError.message,
    });
    throw qualityError;
  }

  await updateVideoJob(job.id, {
    status: "completed",
    storedSourcePath: storedKey,
    nextPollAt: new Date(0),
    errorMessage: null,
    responseJson: {
      ...(job.responseJson ?? {}),
      durationSeconds: media.durationMs / 1_000,
      mediaQuality: media,
    },
  });
  await updateProject(job.projectId, { status: "base_ready" });
  await addAuditEvent(
    job.projectId,
    "video.quality_passed",
    { jobId: job.id, providerVideoId: job.providerVideoId, media },
    `video:${job.id}:quality_passed`,
  );
  await addAuditEvent(
    job.projectId,
    "video.completed",
    {
      jobId: job.id,
      providerVideoId: job.providerVideoId,
      storedPath: storedKey,
      media,
    },
    `video:${job.id}:completed`,
  );
  return storedKey;
}

export async function requestVideoForProject(input: {
  projectId: string;
  avatarId: string;
  voiceId: string;
  retryFailed?: boolean;
}) {
  const project = await getProject(input.projectId);
  if (!project) throw new Error("Project not found");
  if (!project.finalScriptJson) throw new Error("O roteiro final ainda não está pronto.");

  const callbackId = createHash("sha256")
    .update(`${project.id}:${project.finalScriptJson.spoken_script}:${input.avatarId}:${input.voiceId}`)
    .digest("hex")
    .slice(0, 32);
  const plan: VideoPlan = {
    title: project.title,
    script: project.finalScriptJson.spoken_script,
    avatarId: input.avatarId,
    voiceId: input.voiceId,
    resolution: "1080p",
    aspectRatio: "9:16",
    outputFormat: "mp4",
    callbackId,
    engine: null,
  };
  const planHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const baseIdempotencyKey = `besorah:${project.id}:${planHash.slice(0, 32)}`;
  const detail = await getProjectDetail(project.id);
  const failedAttempts = (detail?.jobs ?? []).filter(
    (candidate) => candidate.planHash === planHash && candidate.status === "failed",
  ).length;
  const idempotencyKey = input.retryFailed && failedAttempts > 0
    ? `${baseIdempotencyKey}:retry:${failedAttempts}`
    : baseIdempotencyKey;
  const job = await createVideoJob({
    projectId: project.id,
    idempotencyKey,
    planHash,
    plan,
  });
  if (!job) throw new Error("Não foi possível criar o job de vídeo.");
  if (job.providerVideoId || job.status === "completed") {
    return syncVideoJob(job.id);
  }

  const provider = getVideoProvider();
  await updateProject(project.id, {
    status: "video_queued",
    selectedAvatarId: input.avatarId,
    selectedVoiceId: input.voiceId,
  });
  await addAuditEvent(project.id, "video.requested", {
    jobId: job.id,
    mode: provider.mode,
    idempotencyKey,
  });

  try {
    const created = await provider.createVideo(plan, idempotencyKey);
    await updateVideoJob(job.id, {
      providerVideoId: created.videoId,
      // Provider completion is only a signal. The application reaches
      // `completed` after the downloaded MP4 passes the media quality gate.
      status: created.status === "completed" ? "processing" : databaseStatus(created.status),
      responseJson: {
        videoId: created.videoId,
        status: created.status,
        outputFormat: created.outputFormat,
      },
      nextPollAt: nextPollDate(0),
    });
    await updateProject(project.id, {
      status: created.status === "failed" ? "failed" : "video_processing",
    });

    if (provider.mode === "mock") {
      const terminal = await provider.waitForVideo(created.videoId, {
        initialDelayMs: 0,
        maxDelayMs: 0,
        maxAttempts: 6,
      });
      if (terminal.status === "completed") {
        const refreshed = await getVideoJob(job.id);
        if (refreshed) await persistCompletedVideo(refreshed, provider);
      }
    } else if (created.status === "completed") {
      const refreshed = await getVideoJob(job.id);
      if (refreshed) await persistCompletedVideo(refreshed, provider);
    }
    return getVideoJob(job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no provider de vídeo.";
    await updateVideoJob(job.id, { status: "failed", errorMessage: message });
    await updateProject(project.id, { status: "failed" });
    await addAuditEvent(project.id, "video.failed", { jobId: job.id, message });
    logger.error("video.create_failed", { projectId: project.id, jobId: job.id, message });
    throw error;
  }
}

export async function syncVideoJob(jobId: string) {
  const job = await getVideoJob(jobId);
  if (!job) throw new Error("Video job not found");
  if (job.status === "completed") {
    if (job.providerVideoId) {
      await persistCompletedVideo(job, getVideoProvider());
      return getVideoJob(job.id);
    }
    return job;
  }
  if (["failed", "cancelled"].includes(job.status)) return job;
  if (!job.providerVideoId) return job;
  if (job.nextPollAt && job.nextPollAt.getTime() > Date.now()) return job;

  const provider = getVideoProvider();
  const attempt = job.pollAttempt + 1;
  try {
    const video = await provider.getVideo(job.providerVideoId);
    await updateVideoJob(job.id, {
      status: video.status === "completed" ? "processing" : databaseStatus(video.status),
      pollAttempt: attempt,
      nextPollAt: nextPollDate(attempt),
      responseJson: {
        videoId: video.videoId,
        status: video.status,
        durationSeconds: video.durationSeconds,
        failureCode: video.failureCode,
      },
      errorMessage: video.failureMessage ?? "",
    });
    if (video.status === "completed") {
      const refreshed = await getVideoJob(job.id);
      if (refreshed) await persistCompletedVideo(refreshed, provider);
    } else if (video.status === "failed") {
      await updateProject(job.projectId, { status: "failed" });
      await addAuditEvent(job.projectId, "video.failed", {
        jobId: job.id,
        code: video.failureCode,
        message: video.failureMessage,
      });
    } else {
      await updateProject(job.projectId, { status: "video_processing" });
    }
    return getVideoJob(job.id);
  } catch (error) {
    const retryAfter = error instanceof VideoProviderHttpError ? error.retryAfterSeconds : null;
    await updateVideoJob(job.id, {
      pollAttempt: attempt,
      nextPollAt: nextPollDate(attempt, retryAfter),
      errorMessage: error instanceof Error ? error.message : "Falha temporária no polling.",
    });
    throw error;
  }
}

export async function processHeyGenWebhook(
  headers: WebhookHeaders,
  rawBody: Uint8Array,
) {
  const provider = getVideoProvider();
  const event = await provider.handleWebhook(headers, rawBody);
  if (await getAuditEventByKey(`heygen:${event.eventId}`)) return event;
  const job = await getVideoJobByProviderId(event.videoId);
  if (!job) throw new Error("Video job not found");
  await addAuditEvent(
    job.projectId,
    event.status === "completed" ? "video.webhook_success" : "video.webhook_failure",
    { eventId: event.eventId, videoId: event.videoId, status: event.status },
    `heygen:${event.eventId}`,
  );
  await updateVideoJob(job.id, {
    // A success webhook is a signal. Keep the job non-terminal until the
    // authoritative status endpoint is checked and the temporary URL is copied.
    status: event.status === "completed" ? "processing" : "failed",
    nextPollAt: new Date(0),
    errorMessage: event.errorMessage ?? "",
  });
  if (event.status === "completed") await syncVideoJob(job.id);
  else {
    await updateProject(job.projectId, { status: "failed" });
    await addAuditEvent(job.projectId, "video.failed", {
      jobId: job.id,
      code: event.errorCode,
      message: event.errorMessage,
    });
  }
  return event;
}

export async function cancelVideoJob(jobId: string) {
  const job = await getVideoJob(jobId);
  if (!job) throw new Error("Video job not found");
  if (!job.providerVideoId) throw new Error("O vídeo ainda não possui ID no provider.");
  const result = await getVideoProvider().cancelVideo(job.providerVideoId);
  if (!result.supported) throw new Error("A HeyGen v3 não oferece cancelamento de render.");
  await updateVideoJob(job.id, { status: "cancelled" });
  return job;
}
