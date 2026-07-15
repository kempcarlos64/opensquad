import type { VideoPlan } from "@/lib/domain";

export type VideoProviderStatus =
  | "queued"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type VideoProviderAvatar = {
  id: string;
  name: string;
  groupId: string | null;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  gender: string | null;
  tags: string[];
  defaultVoiceId: string | null;
  supportedApiEngines: string[];
  imageWidth: number | null;
  imageHeight: number | null;
};

export type VideoProviderVoice = {
  id: string;
  name: string;
  language: string;
  gender: string | null;
  type: "public" | "private";
  supportsPause: boolean;
  supportsLocale: boolean;
  previewAudioUrl: string | null;
};

export type CreateVideoResult = {
  videoId: string;
  status: VideoProviderStatus;
  rawStatus: string;
  outputFormat: "mp4" | "webm";
};

export type VideoProviderVideo = {
  videoId: string;
  status: VideoProviderStatus;
  rawStatus: string;
  title: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  captionedVideoUrl: string | null;
  subtitleUrl: string | null;
  durationSeconds: number | null;
  createdAt: number | null;
  completedAt: number | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type VideoWebhookEvent = {
  eventId: string;
  eventType: "avatar_video.success" | "avatar_video.fail";
  videoId: string;
  status: "completed" | "failed";
  callbackId: string | null;
  videoUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  occurredAt: string | null;
  payload: Readonly<Record<string, unknown>>;
};

export type VideoDownload = {
  videoId: string;
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  contentLength: number | null;
  fileName: string;
};

export type CancelVideoResult =
  | {
      videoId: string;
      supported: false;
      status: null;
    }
  | {
      videoId: string;
      supported: true;
      status: "cancelled";
    };

export type WebhookHeaders =
  | Headers
  | Readonly<Record<string, string | readonly string[] | undefined>>;

export type PollVideoOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

export interface VideoProvider {
  readonly name: "heygen";
  readonly mode: "real" | "mock";

  listAvatars(): Promise<VideoProviderAvatar[]>;
  listVoices(): Promise<VideoProviderVoice[]>;
  createVideo(
    plan: VideoPlan,
    idempotencyKey: string,
  ): Promise<CreateVideoResult>;
  getVideo(videoId: string): Promise<VideoProviderVideo>;
  waitForVideo(
    videoId: string,
    options?: PollVideoOptions,
  ): Promise<VideoProviderVideo>;
  handleWebhook(
    headers: WebhookHeaders,
    rawBody: Uint8Array,
  ): Promise<VideoWebhookEvent>;
  downloadCompletedVideo(videoId: string): Promise<VideoDownload>;
  cancelVideo(videoId: string): Promise<CancelVideoResult>;
}
