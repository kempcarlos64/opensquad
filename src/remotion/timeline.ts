import {
  parseSrt,
  serializeSrt,
  type Caption as RemotionCaption,
} from "@remotion/captions";

import {
  renderTimelineSchema,
  type FinalScript,
  type RenderTimeline,
} from "../lib/domain";

const DEFAULT_ACCENT = "#D9FF63";
const DEFAULT_BACKGROUND = "#07120F";
const DEFAULT_FOREGROUND = "#F7F8F2";
const DEFAULT_SAFE_AREA_PX = 144;
const INTRO_MAX_MS = 500;
const CTA_OUTRO_MS = 2_800;
const DEFAULT_WORDS_PER_MINUTE = 155;

export type TimelineScript = Pick<
  FinalScript,
  "hook" | "spoken_script" | "cta" | "scene_plan"
>;

export type TimelineBroll = {
  id?: string;
  fromMs: number;
  toMs: number;
  assetUrl: string;
  text?: string;
};

export type BuildRenderTimelineInput = {
  baseVideoUrl: string;
  script: TimelineScript | string;
  srt?: string;
  durationMs?: number;
  title?: string;
  cta?: string;
  broll?: TimelineBroll[];
  theme?: Partial<RenderTimeline["theme"]>;
};

type CaptionBlock = {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number | null;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeInteger(value: number): number {
  return Math.max(0, Math.round(value));
}

function wordsIn(text: string): string[] {
  return text.trim().split(/\s+/u).filter(Boolean);
}

function estimatedSpeechDurationMs(text: string): number {
  const wordCount = wordsIn(text).length;
  return Math.max(
    1_000,
    Math.ceil((wordCount / DEFAULT_WORDS_PER_MINUTE) * 60_000),
  );
}

function normalizeScript(script: TimelineScript | string): {
  text: string;
  hook: string;
  cta: string;
  sceneDurationMs: number;
} {
  if (typeof script === "string") {
    const trimmed = script.trim();
    return {
      text: trimmed,
      hook: trimmed.split(/[.!?\n]/u)[0]?.trim() || "Besorah",
      cta: "Conheça a Besorah",
      sceneDurationMs: 0,
    };
  }

  return {
    text: script.spoken_script.trim(),
    hook: script.hook.trim(),
    cta: script.cta.trim(),
    sceneDurationMs: Math.round(
      script.scene_plan.reduce(
        (total, scene) => total + scene.duration_seconds * 1_000,
        0,
      ),
    ),
  };
}

function parseCaptionBlocks(srt: string): CaptionBlock[] {
  const normalizedSrt = srt.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const parsed = parseSrt({ input: normalizedSrt }).captions;

  return parsed
    .map((caption) => ({
      text: caption.text.replace(/\s+/gu, " ").trim(),
      startMs: normalizeInteger(caption.startMs),
      endMs: normalizeInteger(caption.endMs),
      confidence: caption.confidence,
    }))
    .filter(
      (caption) =>
        caption.text.length > 0 && caption.endMs > caption.startMs,
    );
}

function blockFromPlainText(text: string, durationMs: number): CaptionBlock[] {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized) return [];

  return [
    {
      text: normalized,
      startMs: 0,
      endMs: Math.max(1, normalizeInteger(durationMs)),
      confidence: null,
    },
  ];
}

/**
 * Converts phrase-level SRT entries into word-level captions. The allocation is
 * deterministic and weighted by word length, so rendering stays pure and can be
 * reproduced by a worker without a transcription provider.
 */
export function captionBlocksToWords(
  blocks: CaptionBlock[],
): RenderTimeline["captions"] {
  const captions: RenderTimeline["captions"] = [];

  for (const block of blocks) {
    const words = wordsIn(block.text);
    if (words.length === 0) continue;

    const duration = Math.max(words.length, block.endMs - block.startMs);
    const weights = words.map((word) => Math.max(2, Array.from(word).length));
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    let consumedWeight = 0;
    let previousEnd = block.startMs;

    words.forEach((word, index) => {
      consumedWeight += weights[index] ?? 0;
      const isLast = index === words.length - 1;
      const weightedEnd = Math.round(
        block.startMs + (duration * consumedWeight) / totalWeight,
      );
      const endMs = Math.max(
        previousEnd + 1,
        isLast ? block.endMs : Math.min(block.endMs, weightedEnd),
      );

      captions.push({
        text: captions.length === 0 ? word : ` ${word}`,
        startMs: previousEnd,
        endMs,
        timestampMs: Math.round((previousEnd + endMs) / 2),
        confidence: block.confidence,
      });
      previousEnd = endMs;
    });
  }

  return captions;
}

function compactTitle(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 64) return normalized;

  const shortened = normalized.slice(0, 61).trimEnd();
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, Math.max(24, lastSpace))}…`;
}

function buildBrollOverlays(
  broll: TimelineBroll[],
  durationMs: number,
): RenderTimeline["overlays"] {
  return broll.flatMap((item, index) => {
    const fromMs = clamp(normalizeInteger(item.fromMs), 0, durationMs - 1);
    const toMs = clamp(normalizeInteger(item.toMs), fromMs + 1, durationMs);
    const assetUrl = item.assetUrl.trim();
    if (!assetUrl || toMs <= fromMs) return [];

    return [
      {
        id: item.id?.trim() || `broll-${index + 1}`,
        kind: "broll" as const,
        fromMs,
        toMs,
        text: item.text?.trim() || "B-roll",
        assetUrl,
      },
    ];
  });
}

/** Builds the data-driven timeline consumed by the Remotion composition. */
export function buildRenderTimeline(
  input: BuildRenderTimelineInput,
): RenderTimeline {
  const script = normalizeScript(input.script);
  if (!input.baseVideoUrl.trim()) {
    throw new Error("baseVideoUrl is required to build a render timeline");
  }
  if (!script.text) {
    throw new Error("A non-empty spoken script is required");
  }

  const parsedBlocks = input.srt?.trim()
    ? parseCaptionBlocks(input.srt)
    : [];
  const parsedEndMs = parsedBlocks.at(-1)?.endMs ?? 0;
  const requestedDurationMs = input.durationMs
    ? normalizeInteger(input.durationMs)
    : 0;
  // A measured media duration is authoritative; otherwise timed SRT is more
  // reliable than scene estimates. This prevents trailing black frames when a
  // script estimate differs slightly from the downloaded HeyGen MP4.
  const durationMs = Math.max(
    1,
    requestedDurationMs ||
      parsedEndMs ||
      script.sceneDurationMs ||
      estimatedSpeechDurationMs(script.text),
  );
  const blocks =
    parsedBlocks.length > 0
      ? parsedBlocks
      : blockFromPlainText(script.text, durationMs);
  const captions = captionBlocksToWords(blocks).filter(
    (caption) => caption.startMs < durationMs,
  );
  const boundedCaptions = captions.map((caption) => ({
    ...caption,
    endMs: Math.min(durationMs, caption.endMs),
    timestampMs: Math.min(durationMs, caption.timestampMs),
  }));

  const title = compactTitle(input.title?.trim() || script.hook || "Besorah");
  const cta = input.cta?.trim() || script.cta || "Conheça a Besorah";
  const overlays: RenderTimeline["overlays"] = [
    {
      id: "besorah-logo",
      kind: "logo",
      fromMs: 0,
      toMs: durationMs,
      text: "Besorah",
      assetUrl: null,
    },
    {
      id: "intro-title",
      kind: "title",
      fromMs: 0,
      toMs: Math.min(INTRO_MAX_MS, durationMs),
      text: title,
      assetUrl: null,
    },
    ...buildBrollOverlays(input.broll ?? [], durationMs),
    {
      id: "outro-cta",
      kind: "cta",
      fromMs: Math.max(0, durationMs - CTA_OUTRO_MS),
      toMs: durationMs,
      text: cta,
      assetUrl: null,
    },
  ];

  return renderTimelineSchema.parse({
    version: 1,
    durationMs,
    baseVideoUrl: input.baseVideoUrl.trim(),
    captions: boundedCaptions,
    overlays,
    theme: {
      background: input.theme?.background ?? DEFAULT_BACKGROUND,
      foreground: input.theme?.foreground ?? DEFAULT_FOREGROUND,
      accent: input.theme?.accent ?? DEFAULT_ACCENT,
      safeAreaPx: input.theme?.safeAreaPx ?? DEFAULT_SAFE_AREA_PX,
    },
  });
}

function toRemotionCaption(
  caption: RenderTimeline["captions"][number],
): RemotionCaption {
  return {
    text: caption.text,
    startMs: caption.startMs,
    endMs: caption.endMs,
    timestampMs: caption.timestampMs,
    confidence: caption.confidence,
  };
}

/** Serializes readable, bounded subtitle blocks from the same timeline data. */
export function timelineToSrt(
  timelineInput: RenderTimeline,
  maxCharactersPerBlock = 42,
): string {
  const timeline = renderTimelineSchema.parse(timelineInput);
  const lines: RemotionCaption[][] = [];
  let current: RemotionCaption[] = [];

  for (const sourceCaption of timeline.captions) {
    const caption = toRemotionCaption(sourceCaption);
    const nextText = `${current.map((item) => item.text).join("")}${caption.text}`;
    const currentStartMs = current[0]?.startMs ?? caption.startMs;
    const previous = current.at(-1);
    const shouldBreak =
      current.length > 0 &&
      (nextText.trim().length > maxCharactersPerBlock ||
        caption.endMs - currentStartMs > 2_800 ||
        (previous ? caption.startMs - previous.endMs > 650 : false));

    if (shouldBreak) {
      lines.push(current);
      current = [];
    }
    current.push(
      current.length === 0
        ? { ...caption, text: caption.text.trimStart() }
        : caption,
    );
  }

  if (current.length > 0) lines.push(current);
  return serializeSrt({ lines });
}

export const REMOTION_TIMELINE_DEFAULTS = {
  fps: 30,
  width: 1080,
  height: 1920,
  introMaxMs: INTRO_MAX_MS,
} as const;
