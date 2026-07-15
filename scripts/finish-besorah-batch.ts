import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";

import { renderTimelineSchema } from "../src/lib/domain";
import { renderTimelineToFiles } from "../src/remotion/render";
import {
  assertMediaQuality,
  sourceVideoRequirements,
} from "../src/server/media/quality";

async function main(): Promise<void> {
  const sourceDirectory = path.resolve(
    process.argv[2] ?? "output/besorah-3-videos-2026-07-15",
  );
  const outputDirectory = path.join(sourceDirectory, "final");
  const sourceFiles = (await readdir(sourceDirectory))
    .filter((name) => /^\d{2}-.*\.mp4$/u.test(name))
    .sort();

  if (sourceFiles.length === 0) {
    throw new Error(`Nenhum MP4-base encontrado em ${sourceDirectory}`);
  }

  for (const sourceName of sourceFiles) {
    const sourcePath = path.join(sourceDirectory, sourceName);
    const stem = path.basename(sourceName, ".mp4");
    const sourceSrtPath = path.join(sourceDirectory, `${stem}.srt`);
    const sourceMedia = await assertMediaQuality(
      sourcePath,
      sourceVideoRequirements(),
    );
    const timeline = renderTimelineSchema.parse({
      version: 1,
      durationMs: sourceMedia.durationMs,
      baseVideoUrl: sourcePath,
      // The HeyGen Video Agent already burned styled captions and scene graphics
      // into these masters. Keep this layer empty to avoid duplicate text.
      captions: [],
      overlays: [],
      theme: {
        background: "#07120F",
        foreground: "#F7F8F2",
        accent: "#D6B45C",
        safeAreaPx: 144,
      },
    });
    let lastProgressKey = "";

    const result = await renderTimelineToFiles({
      timeline,
      outputDirectory,
      fileStem: `${stem}-final-1080x1920`,
      concurrency: 1,
      onProgress: ({ phase, progress, renderedFrames, encodedFrames }) => {
        const progressKey = `${phase}:${Math.floor(progress * 20)}`;
        if (phase !== "completed" && progressKey === lastProgressKey) return;
        lastProgressKey = progressKey;
        process.stdout.write(
          `${JSON.stringify({
            video: stem,
            phase,
            progress: Math.round(progress * 1_000) / 1_000,
            renderedFrames,
            encodedFrames,
          })}\n`,
        );
      },
    });

    await copyFile(sourceSrtPath, result.srtPath);
    process.stdout.write(
      `${JSON.stringify({ video: stem, status: "completed", ...result })}\n`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
