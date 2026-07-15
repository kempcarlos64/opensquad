import { Composition } from "remotion";

import { renderTimelineSchema, type RenderTimeline } from "../lib/domain";
import {
  BesorahOrganicVertical,
  type BesorahOrganicVerticalProps,
} from "./BesorahOrganicVertical";
import { BESORAH_ORGANIC_VERTICAL_ID } from "./constants";
import { REMOTION_TIMELINE_DEFAULTS } from "./timeline";

export { BESORAH_ORGANIC_VERTICAL_ID } from "./constants";

const defaultTimeline: RenderTimeline = {
  version: 1,
  durationMs: 8_000,
  baseVideoUrl: "mock/heygen-base.mp4",
  captions: [],
  overlays: [
    {
      id: "besorah-logo",
      kind: "logo",
      fromMs: 0,
      toMs: 8_000,
      text: "Besorah",
      assetUrl: null,
    },
  ],
  theme: {
    background: "#07120F",
    foreground: "#F7F8F2",
    accent: "#D9FF63",
    safeAreaPx: 144,
  },
};

const defaultProps: BesorahOrganicVerticalProps = {
  timeline: defaultTimeline,
};

export function RemotionRoot() {
  return (
    <Composition
      id={BESORAH_ORGANIC_VERTICAL_ID}
      component={BesorahOrganicVertical}
      width={REMOTION_TIMELINE_DEFAULTS.width}
      height={REMOTION_TIMELINE_DEFAULTS.height}
      fps={REMOTION_TIMELINE_DEFAULTS.fps}
      durationInFrames={Math.ceil(
        (defaultTimeline.durationMs / 1_000) * REMOTION_TIMELINE_DEFAULTS.fps,
      )}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const timeline = renderTimelineSchema.parse(props.timeline);
        return {
          durationInFrames: Math.max(
            1,
            Math.ceil(
              (timeline.durationMs / 1_000) * REMOTION_TIMELINE_DEFAULTS.fps,
            ),
          ),
          props: { timeline },
        };
      }}
    />
  );
}
