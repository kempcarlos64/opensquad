import { describe, expect, it } from "vitest";

import {
  evaluateMediaQuality,
  finalVideoRequirements,
  MediaQualityError,
  type MediaQualityReport,
  sourceVideoRequirements,
} from "../../src/server/media/quality";

const VALID_MEDIA: MediaQualityReport = {
  stage: "final",
  fileSizeBytes: 2_000_000,
  durationMs: 30_120,
  width: 1080,
  height: 1920,
  fps: 30,
  aspectRatio: 9 / 16,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  canPlayInVideoTag: true,
};

describe("media quality gates", () => {
  it("accepts a playable vertical render with audio and expected duration", () => {
    const issues = evaluateMediaQuality(
      VALID_MEDIA,
      finalVideoRequirements(30_000),
    );

    expect(issues).toEqual([]);
  });

  it("rejects a video without an audio stream", () => {
    const issues = evaluateMediaQuality(
      { ...VALID_MEDIA, audioCodec: null, hasAudio: false },
      finalVideoRequirements(30_000),
    );

    expect(issues).toContainEqual(
      expect.objectContaining({ code: "media_audio_missing" }),
    );
    expect(issues[0]?.message).toMatch(/não contém uma faixa de áudio/i);
  });

  it("rejects missing visual media, wrong dimensions and duration drift", () => {
    const issues = evaluateMediaQuality(
      {
        ...VALID_MEDIA,
        durationMs: 12_000,
        width: 1920,
        height: 1080,
        aspectRatio: 16 / 9,
        fps: 0,
        videoCodec: "unknown",
        canPlayInVideoTag: false,
      },
      finalVideoRequirements(30_000),
    );
    const codes = issues.map((issue) => issue.code);

    expect(codes).toContain("media_video_missing");
    expect(codes).toContain("media_duration_mismatch");
    expect(codes).toContain("media_dimensions_mismatch");
    expect(codes).toContain("media_aspect_ratio_invalid");
  });

  it("allows source resolution above the vertical minimum", () => {
    const issues = evaluateMediaQuality(
      {
        ...VALID_MEDIA,
        stage: "source",
        width: 720,
        height: 1280,
        aspectRatio: 9 / 16,
      },
      sourceVideoRequirements(30_000),
    );

    expect(issues).toEqual([]);
  });

  it("exposes a stable code and structured audit payload", () => {
    const issue = {
      code: "media_audio_missing" as const,
      message: "O vídeo não contém áudio.",
    };
    const error = new MediaQualityError("source", [issue], VALID_MEDIA);

    expect(error.code).toBe("media_audio_missing");
    expect(error.toAuditPayload()).toMatchObject({
      stage: "source",
      code: "media_audio_missing",
      issues: [issue],
      media: VALID_MEDIA,
    });
  });
});
