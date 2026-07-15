import { registerRoot } from "remotion";

import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);

export { BESORAH_ORGANIC_VERTICAL_ID, RemotionRoot } from "./Root";
export { BesorahOrganicVertical } from "./BesorahOrganicVertical";
export {
  REMOTION_TIMELINE_DEFAULTS,
  buildRenderTimeline,
  captionBlocksToWords,
  timelineToSrt,
} from "./timeline";
export type {
  BuildRenderTimelineInput,
  TimelineBroll,
  TimelineScript,
} from "./timeline";
