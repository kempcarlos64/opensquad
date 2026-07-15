import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderTimelineSchema, type RenderTimeline } from "../lib/domain";
import {
  assertMediaQuality,
  finalVideoRequirements,
  type MediaQualityReport,
  sourceVideoRequirements,
} from "../server/media/quality";
import { BESORAH_ORGANIC_VERTICAL_ID } from "./constants";
import { timelineToSrt } from "./timeline";

export type RenderWorkerProgress = {
  phase: "bundling" | "rendering" | "completed";
  progress: number;
  renderedFrames?: number;
  encodedFrames?: number;
};

export type RenderTimelineToFilesOptions = {
  timeline: RenderTimeline;
  outputDirectory: string;
  fileStem?: string;
  entryPoint?: string;
  concurrency?: number;
  overwrite?: boolean;
  onProgress?: (progress: RenderWorkerProgress) => void;
};

export type RenderTimelineFiles = {
  videoPath: string;
  srtPath: string;
  durationMs: number;
  sourceMedia: MediaQualityReport | null;
  finalMedia: MediaQualityReport;
};

type PreparedTimeline = {
  timeline: RenderTimeline;
  publicDirectory: string;
};

function isRemoteAsset(source: string): boolean {
  return /^(?:https?:|data:|blob:)/iu.test(source);
}

function localAssetPath(source: string): string | null {
  if (isRemoteAsset(source)) return null;

  if (source.startsWith("file:")) {
    try {
      return fileURLToPath(source);
    } catch {
      return null;
    }
  }

  const direct = path.resolve(process.cwd(), source);
  if (existsSync(direct)) return direct;

  const publicAsset = path.resolve(process.cwd(), "public", source);
  return existsSync(publicAsset) ? publicAsset : null;
}

async function prepareTimelineAssets(
  timeline: RenderTimeline,
): Promise<PreparedTimeline> {
  const publicDirectory = await mkdtemp(
    path.join(tmpdir(), "besorah-remotion-assets-"),
  );
  const assetDirectory = path.join(publicDirectory, "assets");
  await mkdir(assetDirectory, { recursive: true });
  let assetIndex = 0;

  const materialize = async (source: string): Promise<string> => {
    const localPath = localAssetPath(source);
    if (!localPath) return source;

    assetIndex += 1;
    const extension = path.extname(localPath).toLowerCase() || ".bin";
    const relativePath = `assets/${String(assetIndex).padStart(2, "0")}${extension}`;
    await copyFile(localPath, path.join(publicDirectory, relativePath));
    return relativePath;
  };

  try {
    const baseVideoUrl = await materialize(timeline.baseVideoUrl);
    const overlays = await Promise.all(
      timeline.overlays.map(async (overlay) => {
        if (!overlay.assetUrl) return overlay;
        return { ...overlay, assetUrl: await materialize(overlay.assetUrl) };
      }),
    );

    return {
      timeline: { ...timeline, baseVideoUrl, overlays },
      publicDirectory,
    };
  } catch (error) {
    await rm(publicDirectory, { recursive: true, force: true });
    throw error;
  }
}

function safeFileStem(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^\.+/u, "")
    .slice(0, 100);
  return normalized || "besorah-organic-video";
}

async function removeTemporaryBundle(serveUrl: string): Promise<void> {
  if (!existsSync(serveUrl)) return;
  const relativeToTemp = path.relative(tmpdir(), path.resolve(serveUrl));
  if (relativeToTemp.startsWith("..") || path.isAbsolute(relativeToTemp)) return;
  await rm(serveUrl, { recursive: true, force: true });
}

/**
 * Generic external-worker API. It bundles the Remotion entry point, renders an
 * H.264/AAC MP4, and writes SRT generated from the exact same timeline.
 */
export async function renderTimelineToFiles(
  options: RenderTimelineToFilesOptions,
): Promise<RenderTimelineFiles> {
  const timeline = renderTimelineSchema.parse(options.timeline);
  const outputDirectory = path.resolve(options.outputDirectory);
  const fileStem = safeFileStem(options.fileStem ?? "besorah-organic-video");
  const videoPath = path.join(outputDirectory, `${fileStem}.mp4`);
  const srtPath = path.join(outputDirectory, `${fileStem}.srt`);
  const entryPoint = path.resolve(
    options.entryPoint ?? path.join(process.cwd(), "src/remotion/index.ts"),
  );
  await mkdir(outputDirectory, { recursive: true });

  const localSource = localAssetPath(timeline.baseVideoUrl);
  const sourceMedia = localSource
    ? await assertMediaQuality(
      localSource,
      sourceVideoRequirements(timeline.durationMs),
    )
    : null;

  const prepared = await prepareTimelineAssets(timeline);
  let serveUrl: string | null = null;

  try {
    serveUrl = await bundle({
      entryPoint,
      publicDir: prepared.publicDirectory,
      onProgress: (progress) => {
        options.onProgress?.({ phase: "bundling", progress: progress / 100 });
      },
    });
    const inputProps = { timeline: prepared.timeline };
    const composition = await selectComposition({
      serveUrl,
      id: BESORAH_ORGANIC_VERTICAL_ID,
      inputProps,
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      audioBitrate: "192k",
      sampleRate: 48_000,
      muted: false,
      enforceAudioTrack: true,
      pixelFormat: "yuv420p",
      crf: 18,
      inputProps,
      outputLocation: videoPath,
      overwrite: options.overwrite ?? true,
      concurrency: options.concurrency ?? 1,
      onProgress: (progress) => {
        options.onProgress?.({
          phase: "rendering",
          progress: progress.progress,
          renderedFrames: progress.renderedFrames,
          encodedFrames: progress.encodedFrames,
        });
      },
    });

    const finalMedia = await assertMediaQuality(
      videoPath,
      finalVideoRequirements(timeline.durationMs),
    );
    await writeFile(srtPath, timelineToSrt(timeline), "utf8");
    options.onProgress?.({ phase: "completed", progress: 1 });

    return {
      videoPath,
      srtPath,
      durationMs: timeline.durationMs,
      sourceMedia,
      finalMedia,
    };
  } catch (error) {
    await Promise.all([
      rm(videoPath, { force: true }),
      rm(srtPath, { force: true }),
    ]);
    throw error;
  } finally {
    await rm(prepared.publicDirectory, { recursive: true, force: true });
    if (serveUrl) await removeTemporaryBundle(serveUrl);
  }
}
