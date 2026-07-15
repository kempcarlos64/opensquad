import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildRenderTimeline } from "../src/remotion/timeline";
import { getEnv } from "../src/server/env";

function ffmpegExecutable(): string {
  const override = process.env.FFMPEG_PATH?.trim();
  if (override) return override;

  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (probe.status === 0) return "ffmpeg";
  throw new Error(
    "FFmpeg with lavfi support is required. Install ffmpeg or set FFMPEG_PATH.",
  );
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${String(code)}`));
    });
  });
}

function srtTimestamp(milliseconds: number): string {
  const bounded = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(bounded / 3_600_000);
  const minutes = Math.floor((bounded % 3_600_000) / 60_000);
  const seconds = Math.floor((bounded % 60_000) / 1_000);
  const millis = bounded % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function createMockSrt(durationMs: number): string {
  const firstEnd = Math.round(durationMs * 0.34);
  const secondEnd = Math.round(durationMs * 0.68);
  const blocks = [
    [0, firstEnd, "Conteúdo profissional começa com uma boa história."],
    [firstEnd, secondEnd, "A Besorah transforma estratégia em vídeos que conectam."],
    [secondEnd, durationMs, "Crie, revise e publique com confiança."],
  ] as const;

  return blocks
    .map(
      ([fromMs, toMs, text], index) =>
        `${index + 1}\n${srtTimestamp(fromMs)} --> ${srtTimestamp(toMs)}\n${text}`,
    )
    .join("\n\n");
}

async function main(): Promise<void> {
  const durationSeconds = getEnv().MOCK_VIDEO_DURATION_SECONDS;
  const durationMs = Math.round(durationSeconds * 1_000);
  const outputDirectory = path.resolve(process.cwd(), getEnv().STORAGE_ROOT, "mock");
  const videoPath = path.join(outputDirectory, "heygen-base.mp4");
  const srtPath = path.join(outputDirectory, "heygen-base.srt");
  const timelinePath = path.join(outputDirectory, "timeline.json");
  const force = process.argv.includes("--force");
  await mkdir(outputDirectory, { recursive: true });

  let existingDurationMatches = false;
  if (existsSync(timelinePath)) {
    try {
      const existing = JSON.parse(
        await readFile(timelinePath, "utf8"),
      ) as { durationMs?: unknown };
      existingDurationMatches = existing.durationMs === durationMs;
    } catch {
      existingDurationMatches = false;
    }
  }

  if (!existsSync(videoPath) || !existingDurationMatches || force) {
    const duration = durationSeconds.toFixed(3);
    await run(ffmpegExecutable(), [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x07120F:s=1080x1920:r=30:d=${duration}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=180:sample_rate=48000:duration=${duration}`,
      "-vf",
      "drawbox=x=76:y=250:w=928:h=1420:color=0x10231D:t=fill,drawbox=x=76:y=250:w=14:h=1420:color=0xD9FF63:t=fill,drawbox=x=155:y=420:w=770:h=820:color=0x18352B:t=fill",
      "-filter:a",
      "volume=0.025",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      videoPath,
    ]);
  }

  const srt = createMockSrt(durationMs);
  const timeline = buildRenderTimeline({
    baseVideoUrl: videoPath,
    durationMs,
    title: "Conteúdo que conecta",
    script: {
      hook: "Conteúdo que conecta",
      spoken_script:
        "Conteúdo profissional começa com uma boa história. A Besorah transforma estratégia em vídeos que conectam. Crie, revise e publique com confiança.",
      cta: "Transforme sua próxima ideia com a Besorah",
      scene_plan: [
        {
          order: 1,
          spoken: "Conteúdo profissional começa com uma boa história.",
          visual: "Apresentador em plano médio",
          duration_seconds: durationSeconds * 0.34,
        },
        {
          order: 2,
          spoken: "A Besorah transforma estratégia em vídeos que conectam.",
          visual: "Destaque do processo",
          duration_seconds: durationSeconds * 0.34,
        },
        {
          order: 3,
          spoken: "Crie, revise e publique com confiança.",
          visual: "Encerramento com CTA",
          duration_seconds: durationSeconds * 0.32,
        },
      ],
    },
    srt,
  });

  await Promise.all([
    writeFile(srtPath, srt, "utf8"),
    writeFile(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`, "utf8"),
  ]);
  process.stdout.write(
    `${JSON.stringify({ videoPath, srtPath, timelinePath }, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
