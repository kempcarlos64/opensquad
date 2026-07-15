import type { VideoMetadata } from "@remotion/renderer";
import { stat } from "node:fs/promises";

export type MediaQualityStage = "source" | "final";

export type MediaQualityReport = {
  stage: MediaQualityStage;
  fileSizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  aspectRatio: number;
  videoCodec: VideoMetadata["codec"];
  audioCodec: VideoMetadata["audioCodec"];
  hasAudio: boolean;
  canPlayInVideoTag: boolean;
};

export type MediaQualityRequirements = {
  stage: MediaQualityStage;
  requireAudio?: boolean;
  minimumDurationMs?: number;
  expectedDurationMs?: number;
  durationToleranceMs?: number;
  minimumWidth?: number;
  minimumHeight?: number;
  expectedWidth?: number;
  expectedHeight?: number;
  expectedAspectRatio?: number;
  aspectRatioTolerance?: number;
};

export type MediaQualityIssueCode =
  | "media_file_missing"
  | "media_file_empty"
  | "media_probe_failed"
  | "media_video_missing"
  | "media_audio_missing"
  | "media_duration_invalid"
  | "media_duration_mismatch"
  | "media_dimensions_invalid"
  | "media_dimensions_mismatch"
  | "media_aspect_ratio_invalid";

export type MediaQualityIssue = {
  code: MediaQualityIssueCode;
  message: string;
};

export class MediaQualityError extends Error {
  readonly name = "MediaQualityError";

  constructor(
    readonly stage: MediaQualityStage,
    readonly issues: readonly MediaQualityIssue[],
    readonly report: MediaQualityReport | null,
    options?: ErrorOptions,
  ) {
    super(issues[0]?.message ?? "O vídeo não passou na validação de mídia.", options);
  }

  get code(): MediaQualityIssueCode {
    return this.issues[0]?.code ?? "media_probe_failed";
  }

  toAuditPayload(): Record<string, unknown> {
    return {
      stage: this.stage,
      code: this.code,
      issues: this.issues,
      ...(this.report ? { media: this.report } : {}),
    };
  }
}

function formatSeconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(2).replace(".", ",");
}

function defaultDurationTolerance(expectedDurationMs: number): number {
  return Math.max(750, Math.round(expectedDurationMs * 0.05));
}

export function mediaQualityReportFromMetadata(
  metadata: VideoMetadata,
  stage: MediaQualityStage,
  fileSizeBytes: number,
): MediaQualityReport {
  const durationMs = Math.round((metadata.durationInSeconds ?? 0) * 1_000);
  const aspectRatio =
    metadata.width > 0 && metadata.height > 0
      ? metadata.width / metadata.height
      : 0;

  return {
    stage,
    fileSizeBytes,
    durationMs,
    width: metadata.width,
    height: metadata.height,
    fps: metadata.fps,
    aspectRatio,
    videoCodec: metadata.codec,
    audioCodec: metadata.audioCodec,
    hasAudio: metadata.audioCodec !== null,
    canPlayInVideoTag: metadata.canPlayInVideoTag,
  };
}

export function evaluateMediaQuality(
  report: MediaQualityReport,
  requirements: MediaQualityRequirements,
): MediaQualityIssue[] {
  const issues: MediaQualityIssue[] = [];
  const requireAudio = requirements.requireAudio ?? true;
  const minimumDurationMs = requirements.minimumDurationMs ?? 1_000;

  if (
    report.width <= 0 ||
    report.height <= 0 ||
    report.fps <= 0 ||
    report.videoCodec === "unknown" ||
    !report.canPlayInVideoTag
  ) {
    issues.push({
      code: "media_video_missing",
      message:
        "O arquivo não contém uma faixa de vídeo reproduzível. A geração do apresentador não foi concluída corretamente.",
    });
  }

  if (requireAudio && !report.hasAudio) {
    issues.push({
      code: "media_audio_missing",
      message:
        "O vídeo não contém uma faixa de áudio. Gere novamente no HeyGen antes de finalizar.",
    });
  }

  if (!Number.isFinite(report.durationMs) || report.durationMs < minimumDurationMs) {
    issues.push({
      code: "media_duration_invalid",
      message: `O vídeo tem duração inválida ou menor que ${formatSeconds(minimumDurationMs)} segundos.`,
    });
  }

  if (requirements.expectedDurationMs !== undefined) {
    const tolerance =
      requirements.durationToleranceMs ??
      defaultDurationTolerance(requirements.expectedDurationMs);
    const difference = Math.abs(report.durationMs - requirements.expectedDurationMs);
    if (difference > tolerance) {
      issues.push({
        code: "media_duration_mismatch",
        message: `A duração do vídeo (${formatSeconds(report.durationMs)}s) difere da duração esperada (${formatSeconds(requirements.expectedDurationMs)}s).`,
      });
    }
  }

  if (
    (requirements.minimumWidth !== undefined &&
      report.width < requirements.minimumWidth) ||
    (requirements.minimumHeight !== undefined &&
      report.height < requirements.minimumHeight)
  ) {
    issues.push({
      code: "media_dimensions_invalid",
      message: `A resolução ${report.width}x${report.height} é insuficiente para o vídeo vertical.`,
    });
  }

  if (
    (requirements.expectedWidth !== undefined &&
      report.width !== requirements.expectedWidth) ||
    (requirements.expectedHeight !== undefined &&
      report.height !== requirements.expectedHeight)
  ) {
    issues.push({
      code: "media_dimensions_mismatch",
      message: `A resolução final deve ser ${String(requirements.expectedWidth ?? report.width)}x${String(requirements.expectedHeight ?? report.height)}, mas o arquivo possui ${report.width}x${report.height}.`,
    });
  }

  if (requirements.expectedAspectRatio !== undefined && report.aspectRatio > 0) {
    const tolerance = requirements.aspectRatioTolerance ?? 0.03;
    if (Math.abs(report.aspectRatio - requirements.expectedAspectRatio) > tolerance) {
      issues.push({
        code: "media_aspect_ratio_invalid",
        message: `O vídeo deve estar em formato vertical 9:16, mas o arquivo possui proporção ${report.width}:${report.height}.`,
      });
    }
  }

  return issues;
}

export async function assertMediaQuality(
  filePath: string,
  requirements: MediaQualityRequirements,
): Promise<MediaQualityReport> {
  let fileSizeBytes: number;
  try {
    const file = await stat(filePath);
    fileSizeBytes = file.size;
  } catch (error) {
    throw new MediaQualityError(
      requirements.stage,
      [
        {
          code: "media_file_missing",
          message: "O arquivo de vídeo não foi encontrado no storage.",
        },
      ],
      null,
      { cause: error },
    );
  }

  if (fileSizeBytes === 0) {
    throw new MediaQualityError(
      requirements.stage,
      [
        {
          code: "media_file_empty",
          message: "O arquivo de vídeo está vazio.",
        },
      ],
      null,
    );
  }

  let metadata: VideoMetadata;
  try {
    const { getVideoMetadata } = await import("@remotion/renderer");
    metadata = await getVideoMetadata(filePath, { logLevel: "error" });
  } catch (error) {
    throw new MediaQualityError(
      requirements.stage,
      [
        {
          code: "media_probe_failed",
          message:
            "O arquivo baixado não é um vídeo MP4 válido ou não pode ser analisado.",
        },
      ],
      null,
      { cause: error },
    );
  }

  const report = mediaQualityReportFromMetadata(
    metadata,
    requirements.stage,
    fileSizeBytes,
  );
  const issues = evaluateMediaQuality(report, requirements);
  if (issues.length > 0) {
    throw new MediaQualityError(requirements.stage, issues, report);
  }
  return report;
}

export function sourceVideoRequirements(
  expectedDurationMs?: number,
): MediaQualityRequirements {
  return {
    stage: "source",
    requireAudio: true,
    minimumDurationMs: 1_000,
    minimumWidth: 540,
    minimumHeight: 960,
    expectedAspectRatio: 9 / 16,
    aspectRatioTolerance: 0.035,
    ...(expectedDurationMs !== undefined ? { expectedDurationMs } : {}),
  };
}

export function finalVideoRequirements(
  expectedDurationMs: number,
): MediaQualityRequirements {
  return {
    stage: "final",
    requireAudio: true,
    minimumDurationMs: 1_000,
    expectedDurationMs,
    expectedWidth: 1080,
    expectedHeight: 1920,
    expectedAspectRatio: 9 / 16,
    aspectRatioTolerance: 0.005,
  };
}
