import { parseSrt } from "@remotion/captions";
import { describe, expect, it } from "vitest";

import { renderTimelineSchema } from "../../src/lib/domain";
import {
  REMOTION_TIMELINE_DEFAULTS,
  buildRenderTimeline,
  timelineToSrt,
} from "../../src/remotion/timeline";

const SCRIPT = {
  hook: "Pare de publicar conteúdo sem direção",
  spoken_script:
    "Pare de publicar conteúdo sem direção. A Besorah organiza sua estratégia. Transforme sua próxima ideia hoje.",
  cta: "Conheça a Besorah hoje",
  scene_plan: [
    {
      order: 1,
      spoken: "Pare de publicar conteúdo sem direção.",
      visual: "Apresentador",
      duration_seconds: 2,
    },
    {
      order: 2,
      spoken: "A Besorah organiza sua estratégia.",
      visual: "Produto",
      duration_seconds: 2,
    },
    {
      order: 3,
      spoken: "Transforme sua próxima ideia hoje.",
      visual: "CTA",
      duration_seconds: 2,
    },
  ],
};

const SRT = `1
00:00:00,000 --> 00:00:02,000
Pare de publicar conteúdo sem direção.

2
00:00:02,000 --> 00:00:04,000
A Besorah organiza sua estratégia.

3
00:00:04,000 --> 00:00:06,000
Transforme sua próxima ideia hoje.`;

describe("Remotion timeline", () => {
  it("builds a schema-valid, deterministic vertical-video timeline", () => {
    const input = {
      baseVideoUrl: "C:/storage/base-video.mp4",
      script: SCRIPT,
      srt: SRT,
      durationMs: 6_000,
      broll: [
        {
          fromMs: 2_200,
          toMs: 3_800,
          assetUrl: "https://cdn.example.com/process.mp4",
          text: "Processo Besorah",
        },
      ],
    };
    const timeline = buildRenderTimeline(input);

    expect(buildRenderTimeline(input)).toEqual(timeline);
    expect(() => renderTimelineSchema.parse(timeline)).not.toThrow();
    expect(timeline).toMatchObject({
      version: 1,
      durationMs: 6_000,
      baseVideoUrl: "C:/storage/base-video.mp4",
      theme: { safeAreaPx: 144 },
    });
    expect(timeline.captions.length).toBeGreaterThan(10);
    expect(timeline.captions[0]).toMatchObject({
      text: "Pare",
      startMs: 0,
    });
    expect(timeline.captions.at(-1)?.endMs).toBe(6_000);
    expect(
      timeline.captions.every(
        (caption) =>
          caption.startMs >= 0 &&
          caption.endMs <= timeline.durationMs &&
          caption.timestampMs >= caption.startMs &&
          caption.timestampMs <= caption.endMs,
      ),
    ).toBe(true);

    const intro = timeline.overlays.find((overlay) => overlay.kind === "title");
    const logo = timeline.overlays.find((overlay) => overlay.kind === "logo");
    const cta = timeline.overlays.find((overlay) => overlay.kind === "cta");
    const broll = timeline.overlays.find((overlay) => overlay.kind === "broll");
    expect(intro?.toMs).toBeLessThanOrEqual(500);
    expect(logo).toMatchObject({ text: "Besorah", fromMs: 0, toMs: 6_000 });
    expect(cta).toMatchObject({
      text: "Conheça a Besorah hoje",
      fromMs: 3_200,
      toMs: 6_000,
    });
    expect(broll).toMatchObject({
      fromMs: 2_200,
      toMs: 3_800,
      assetUrl: "https://cdn.example.com/process.mp4",
    });
  });

  it("derives word timing from plain script when SRT is unavailable", () => {
    const timeline = buildRenderTimeline({
      baseVideoUrl: "https://cdn.example.com/base.mp4",
      script: "Uma mensagem curta e objetiva para o público certo.",
      durationMs: 4_000,
    });

    expect(timeline.captions.map((caption) => caption.text).join("")).toBe(
      "Uma mensagem curta e objetiva para o público certo.",
    );
    expect(timeline.captions[0]?.startMs).toBe(0);
    expect(timeline.captions.at(-1)?.endMs).toBe(4_000);
  });

  it("treats measured base-video duration as authoritative", () => {
    const timeline = buildRenderTimeline({
      baseVideoUrl: "https://cdn.example.com/base.mp4",
      script: SCRIPT,
      srt: SRT,
      durationMs: 5_500,
    });

    expect(timeline.durationMs).toBe(5_500);
    expect(
      timeline.captions.every((caption) => caption.endMs <= 5_500),
    ).toBe(true);
    expect(timeline.overlays.every((overlay) => overlay.toMs <= 5_500)).toBe(
      true,
    );
  });

  it("exports readable SRT from the same word-level timeline", () => {
    const timeline = buildRenderTimeline({
      baseVideoUrl: "https://cdn.example.com/base.mp4",
      script: SCRIPT,
      srt: SRT,
      durationMs: 6_000,
    });
    const serialized = timelineToSrt(timeline, 38);
    const parsed = parseSrt({ input: serialized }).captions;

    expect(serialized).toContain("00:00:00,000 -->");
    expect(parsed.length).toBeGreaterThan(1);
    expect(parsed.map((caption) => caption.text).join(" ")).toContain(
      "Pare de publicar conteúdo sem direção.",
    );
    expect(parsed.every((caption) => caption.text.length <= 42)).toBe(true);
  });

  it("declares the required production geometry", () => {
    expect(REMOTION_TIMELINE_DEFAULTS).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 30,
      introMaxMs: 500,
    });
  });
});
