import { createTikTokStyleCaptions } from "@remotion/captions";
import { Video } from "@remotion/media";
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { RenderTimeline } from "../lib/domain";

export type BesorahOrganicVerticalProps = {
  timeline: RenderTimeline;
};

type Overlay = RenderTimeline["overlays"][number];

const imageExtension = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/iu;

function millisecondsToFrames(milliseconds: number, fps: number): number {
  return Math.round((milliseconds / 1_000) * fps);
}

function assetSource(source: string): string {
  if (/^(?:https?:|data:|blob:)/iu.test(source)) return source;
  const publicPath = source
    .replaceAll("\\", "/")
    .replace(/^[A-Za-z]:\//u, "")
    .replace(/^\/+/, "");
  return staticFile(publicPath);
}

function fadeInOut(frame: number, durationInFrames: number): number {
  if (durationInFrames <= 2) return 1;
  const transitionFrames = Math.max(
    1,
    Math.min(6, Math.floor(durationInFrames / 3)),
  );

  return interpolate(
    frame,
    [
      0,
      transitionFrames,
      durationInFrames - transitionFrames,
      durationInFrames,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

function OverlaySequence({
  overlay,
  fps,
  children,
}: {
  overlay: Overlay;
  fps: number;
  children: (durationInFrames: number) => ReactNode;
}) {
  const from = millisecondsToFrames(overlay.fromMs, fps);
  const durationInFrames = Math.max(
    1,
    millisecondsToFrames(overlay.toMs - overlay.fromMs, fps),
  );

  return (
    <Sequence
      durationInFrames={durationInFrames}
      from={from}
      name={`${overlay.kind}: ${overlay.text}`}
      layout="none"
    >
      {children(durationInFrames)}
    </Sequence>
  );
}

function BrandLogo({
  overlay,
  safeAreaPx,
  foreground,
  accent,
  durationInFrames,
}: {
  overlay: Overlay;
  safeAreaPx: number;
  foreground: string;
  accent: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 7], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: safeAreaPx,
        left: safeAreaPx,
        display: "flex",
        alignItems: "center",
        gap: 18,
        opacity: Math.min(opacity, fadeInOut(frame, durationInFrames) + 0.15),
        color: foreground,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 36,
        fontWeight: 800,
        letterSpacing: -1,
        textShadow: "0 3px 18px rgba(0, 0, 0, 0.55)",
      }}
    >
      <span
        style={{
          width: 46,
          height: 46,
          borderRadius: 15,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#07120F",
          background: accent,
          fontSize: 29,
          boxShadow: `0 8px 30px ${accent}55`,
        }}
      >
        B
      </span>
      {overlay.text || "Besorah"}
    </div>
  );
}

function IntroTitle({
  overlay,
  safeAreaPx,
  foreground,
  accent,
  durationInFrames,
}: {
  overlay: Overlay;
  safeAreaPx: number;
  foreground: string;
  accent: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const opacity = fadeInOut(frame, durationInFrames);
  const y = interpolate(frame, [0, Math.min(7, durationInFrames)], [-18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: safeAreaPx + 112,
        left: safeAreaPx,
        right: safeAreaPx,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        opacity,
        transform: `translateY(${y}px)`,
        color: foreground,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 58,
        lineHeight: 1.05,
        fontWeight: 900,
        textAlign: "center",
        textWrap: "balance",
        textShadow: "0 4px 24px rgba(0, 0, 0, 0.7)",
      }}
    >
      <span>{overlay.text}</span>
      <span
        style={{
          width: 96,
          height: 8,
          borderRadius: 99,
          background: accent,
          boxShadow: `0 5px 24px ${accent}88`,
        }}
      />
    </div>
  );
}

function BrollCard({
  overlay,
  safeAreaPx,
  foreground,
  accent,
  durationInFrames,
}: {
  overlay: Overlay;
  safeAreaPx: number;
  foreground: string;
  accent: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const opacity = fadeInOut(frame, durationInFrames);
  const scale = interpolate(frame, [0, durationInFrames], [1.025, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const source = overlay.assetUrl ? assetSource(overlay.assetUrl) : null;
  if (!source) return null;

  const mediaStyle: CSSProperties = {
    width: "100%",
    height: "100%",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: safeAreaPx + 250,
        left: safeAreaPx,
        right: safeAreaPx,
        height: 520,
        overflow: "hidden",
        borderRadius: 34,
        border: `3px solid ${accent}88`,
        background: "rgba(7, 18, 15, 0.9)",
        boxShadow: "0 22px 70px rgba(0, 0, 0, 0.42)",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      {imageExtension.test(source) ? (
        <Img src={source} style={{ ...mediaStyle, objectFit: "cover" }} />
      ) : (
        <Video src={source} muted objectFit="cover" style={mediaStyle} />
      )}
      {overlay.text && overlay.text !== "B-roll" ? (
        <div
          style={{
            position: "absolute",
            left: 26,
            right: 26,
            bottom: 24,
            color: foreground,
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: 30,
            fontWeight: 750,
            lineHeight: 1.15,
            textShadow: "0 3px 15px rgba(0, 0, 0, 0.9)",
          }}
        >
          {overlay.text}
        </div>
      ) : null}
    </div>
  );
}

function Captions({
  timeline,
  ctaIsActive,
}: {
  timeline: RenderTimeline;
  ctaIsActive: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1_000;
  const { pages } = createTikTokStyleCaptions({
    captions: timeline.captions,
    combineTokensWithinMilliseconds: 1_150,
  });
  const activePage = pages.find(
    (page) =>
      currentTimeMs >= page.startMs &&
      currentTimeMs < page.startMs + page.durationMs,
  );
  if (!activePage) return null;

  return (
    <div
      aria-label={activePage.text}
      style={{
        position: "absolute",
        left: timeline.theme.safeAreaPx,
        right: timeline.theme.safeAreaPx,
        bottom:
          timeline.theme.safeAreaPx + (ctaIsActive ? 310 : 74),
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        columnGap: 15,
        rowGap: 4,
        padding: "24px 30px 27px",
        borderRadius: 30,
        background:
          "linear-gradient(135deg, rgba(2, 8, 6, 0.82), rgba(2, 8, 6, 0.58))",
        border: "1px solid rgba(255, 255, 255, 0.13)",
        boxShadow: "0 18px 52px rgba(0, 0, 0, 0.32)",
        color: timeline.theme.foreground,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 65,
        lineHeight: 1.06,
        fontWeight: 900,
        letterSpacing: -1.8,
        textAlign: "center",
        textShadow: "0 3px 13px rgba(0, 0, 0, 0.8)",
      }}
    >
      {activePage.tokens.map((token, index) => {
        const isCurrent =
          currentTimeMs >= token.fromMs && currentTimeMs < token.toMs;
        const hasBeenSpoken = currentTimeMs >= token.toMs;
        const tokenFrame = frame - millisecondsToFrames(token.fromMs, fps);
        const pop = spring({
          fps,
          frame: Math.max(0, tokenFrame),
          config: { damping: 18, stiffness: 240, mass: 0.45 },
          durationInFrames: 9,
        });

        return (
          <span
            key={`${token.fromMs}-${index}`}
            style={{
              color: isCurrent
                ? timeline.theme.accent
                : timeline.theme.foreground,
              opacity: hasBeenSpoken || isCurrent ? 1 : 0.72,
              transform: `scale(${isCurrent ? 0.96 + pop * 0.08 : 1})`,
              transformOrigin: "center bottom",
            }}
          >
            {token.text.trim()}
          </span>
        );
      })}
    </div>
  );
}

function OutroCta({
  overlay,
  safeAreaPx,
  foreground,
  accent,
  durationInFrames,
}: {
  overlay: Overlay;
  safeAreaPx: number;
  foreground: string;
  accent: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 170, mass: 0.7 },
    durationInFrames: Math.min(18, durationInFrames),
  });
  const opacity = fadeInOut(frame, durationInFrames);

  return (
    <div
      style={{
        position: "absolute",
        left: safeAreaPx,
        right: safeAreaPx,
        bottom: safeAreaPx,
        minHeight: 190,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 28,
        padding: "34px 38px",
        borderRadius: 34,
        background: "rgba(7, 18, 15, 0.92)",
        border: `2px solid ${accent}88`,
        boxShadow: "0 22px 70px rgba(0, 0, 0, 0.48)",
        opacity,
        transform: `translateY(${(1 - enter) * 34}px)`,
        color: foreground,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          fontSize: 47,
          lineHeight: 1.08,
          fontWeight: 900,
          letterSpacing: -1.1,
        }}
      >
        {overlay.text}
      </div>
      <div
        style={{
          flex: "0 0 auto",
          padding: "20px 27px",
          borderRadius: 22,
          background: accent,
          color: "#07120F",
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Besorah
      </div>
    </div>
  );
}

export function BesorahOrganicVertical({
  timeline,
}: BesorahOrganicVerticalProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1_000;
  const logo = timeline.overlays.find((overlay) => overlay.kind === "logo");
  const title = timeline.overlays.find((overlay) => overlay.kind === "title");
  const cta = timeline.overlays.find((overlay) => overlay.kind === "cta");
  const broll = timeline.overlays.filter(
    (overlay) => overlay.kind === "broll" && overlay.assetUrl,
  );
  const ctaIsActive = Boolean(
    cta && currentTimeMs >= cta.fromMs && currentTimeMs < cta.toMs,
  );

  return (
    <AbsoluteFill style={{ background: timeline.theme.background }}>
      <Video
        src={assetSource(timeline.baseVideoUrl)}
        objectFit="cover"
        style={{ width: "100%", height: "100%" }}
        volume={1}
      />

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(3, 10, 8, 0.32) 0%, rgba(3, 10, 8, 0.02) 34%, rgba(3, 10, 8, 0.1) 58%, rgba(3, 10, 8, 0.56) 100%)",
        }}
      />

      {broll.map((overlay) => (
        <OverlaySequence key={overlay.id} overlay={overlay} fps={fps}>
          {(durationInFrames) => (
            <BrollCard
              overlay={overlay}
              safeAreaPx={timeline.theme.safeAreaPx}
              foreground={timeline.theme.foreground}
              accent={timeline.theme.accent}
              durationInFrames={durationInFrames}
            />
          )}
        </OverlaySequence>
      ))}

      {logo ? (
        <OverlaySequence overlay={logo} fps={fps}>
          {(durationInFrames) => (
            <BrandLogo
              overlay={logo}
              safeAreaPx={timeline.theme.safeAreaPx}
              foreground={timeline.theme.foreground}
              accent={timeline.theme.accent}
              durationInFrames={durationInFrames}
            />
          )}
        </OverlaySequence>
      ) : null}

      {title ? (
        <OverlaySequence overlay={title} fps={fps}>
          {(durationInFrames) => (
            <IntroTitle
              overlay={title}
              safeAreaPx={timeline.theme.safeAreaPx}
              foreground={timeline.theme.foreground}
              accent={timeline.theme.accent}
              durationInFrames={durationInFrames}
            />
          )}
        </OverlaySequence>
      ) : null}

      <Captions timeline={timeline} ctaIsActive={ctaIsActive} />

      {cta ? (
        <OverlaySequence overlay={cta} fps={fps}>
          {(durationInFrames) => (
            <OutroCta
              overlay={cta}
              safeAreaPx={timeline.theme.safeAreaPx}
              foreground={timeline.theme.foreground}
              accent={timeline.theme.accent}
              durationInFrames={durationInFrames}
            />
          )}
        </OverlaySequence>
      ) : null}
    </AbsoluteFill>
  );
}
