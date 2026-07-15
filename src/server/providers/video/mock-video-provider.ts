import type { VideoPlan } from "@/lib/domain";

import { VideoProviderError } from "./errors";
import {
  pollVideoUntilTerminal,
  validateIdempotencyKey,
  validateResourceId,
  validateVideoPlan,
} from "./shared";
import type {
  CancelVideoResult,
  CreateVideoResult,
  PollVideoOptions,
  VideoDownload,
  VideoProvider,
  VideoProviderAvatar,
  VideoProviderStatus,
  VideoProviderVideo,
  VideoProviderVoice,
  VideoWebhookEvent,
  WebhookHeaders,
} from "./types";
import { verifyAndParseHeyGenWebhook } from "./webhook";

export const DEFAULT_MOCK_AVATAR_ID = "besorah-mock-avatar";
export const DEFAULT_MOCK_VOICE_ID = "besorah-mock-voice";

const DEFAULT_AVATARS: readonly VideoProviderAvatar[] = [
  {
    id: DEFAULT_MOCK_AVATAR_ID,
    name: "Besorah Apresentadora (mock)",
    groupId: "besorah-mock-group",
    previewImageUrl: null,
    previewVideoUrl: null,
    gender: "female",
    tags: ["mock", "pt-BR"],
    defaultVoiceId: DEFAULT_MOCK_VOICE_ID,
    supportedApiEngines: ["avatar_iv"],
    imageWidth: 1080,
    imageHeight: 1920,
  },
];

const DEFAULT_VOICES: readonly VideoProviderVoice[] = [
  {
    id: DEFAULT_MOCK_VOICE_ID,
    name: "Besorah Português (mock)",
    language: "Portuguese (Brazil)",
    gender: "female",
    type: "public",
    supportsPause: true,
    supportsLocale: true,
    previewAudioUrl: null,
  },
];

const DEFAULT_VIDEO_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
]);

type MockVideoState = {
  videoId: string;
  plan: VideoPlan;
  status: VideoProviderStatus;
  statusIndex: number;
  createdAt: number;
  completedAt: number | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type MockVideoProviderConfig = {
  avatars?: readonly VideoProviderAvatar[];
  voices?: readonly VideoProviderVoice[];
  statusSequence?: readonly VideoProviderStatus[];
  videoBytes?: Uint8Array;
  videoUrl?: string | ((videoId: string) => string);
  webhookSecret?: string;
  webhookMaxAgeSeconds?: number;
  now?: () => number;
  idFactory?: () => string;
};

export class MockVideoProvider implements VideoProvider {
  readonly name = "heygen" as const;
  readonly mode = "mock" as const;

  private readonly avatars: VideoProviderAvatar[];
  private readonly voices: VideoProviderVoice[];
  private readonly statusSequence: VideoProviderStatus[];
  private readonly videoBytes: Uint8Array;
  private readonly videoUrl: string | ((videoId: string) => string);
  private readonly webhookSecret: string;
  private readonly webhookMaxAgeSeconds: number;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly videos = new Map<string, MockVideoState>();
  private readonly videosByIdempotencyKey = new Map<string, string>();
  private nextId = 1;

  constructor(config: MockVideoProviderConfig = {}) {
    this.avatars = [...(config.avatars ?? DEFAULT_AVATARS)];
    this.voices = [...(config.voices ?? DEFAULT_VOICES)];
    this.statusSequence = [
      ...(config.statusSequence ?? ["pending", "processing", "completed"]),
    ];
    if (this.statusSequence.length === 0) {
      throw new VideoProviderError(
        "A sequência de estados do provider mock não pode ser vazia.",
        { code: "invalid_mock_config" },
      );
    }
    this.videoBytes = (config.videoBytes ?? DEFAULT_VIDEO_BYTES).slice();
    this.videoUrl =
      config.videoUrl ??
      ((videoId: string) => `/api/mock/organic-video/${videoId}.mp4`);
    this.webhookSecret = config.webhookSecret ?? "mock-only-webhook-secret";
    this.webhookMaxAgeSeconds = config.webhookMaxAgeSeconds ?? 300;
    this.now = config.now ?? Date.now;
    this.idFactory =
      config.idFactory ?? (() => `mock-video-${String(this.nextId++).padStart(4, "0")}`);
  }

  async listAvatars(): Promise<VideoProviderAvatar[]> {
    return this.avatars.map((avatar) => ({
      ...avatar,
      tags: [...avatar.tags],
      supportedApiEngines: [...avatar.supportedApiEngines],
    }));
  }

  async listVoices(): Promise<VideoProviderVoice[]> {
    return this.voices.map((voice) => ({ ...voice }));
  }

  async createVideo(
    plan: VideoPlan,
    idempotencyKey: string,
  ): Promise<CreateVideoResult> {
    const parsedPlan = validateVideoPlan(plan);
    const safeIdempotencyKey = validateIdempotencyKey(idempotencyKey);
    const existingVideoId = this.videosByIdempotencyKey.get(safeIdempotencyKey);
    if (existingVideoId !== undefined) {
      const existing = this.requireVideo(existingVideoId);
      return this.createResult(existing);
    }

    if (!this.avatars.some((avatar) => avatar.id === parsedPlan.avatarId)) {
      throw new VideoProviderError("Avatar mock não encontrado.", {
        code: "avatar_not_found",
      });
    }
    if (!this.voices.some((voice) => voice.id === parsedPlan.voiceId)) {
      throw new VideoProviderError("Voz mock não encontrada.", {
        code: "voice_not_found",
      });
    }

    const videoId = validateResourceId(this.idFactory(), "ID do vídeo mock");
    if (this.videos.has(videoId)) {
      throw new VideoProviderError("O gerador de IDs mock produziu uma duplicata.", {
        code: "mock_video_id_conflict",
      });
    }
    const state: MockVideoState = {
      videoId,
      plan: parsedPlan,
      status: "queued",
      statusIndex: 0,
      createdAt: Math.floor(this.now() / 1_000),
      completedAt: null,
      failureCode: null,
      failureMessage: null,
    };
    this.videos.set(videoId, state);
    this.videosByIdempotencyKey.set(safeIdempotencyKey, videoId);
    return this.createResult(state);
  }

  async getVideo(videoId: string): Promise<VideoProviderVideo> {
    const state = this.requireVideo(videoId);
    const nextStatus =
      this.statusSequence[
        Math.min(state.statusIndex, this.statusSequence.length - 1)
      ];
    if (nextStatus !== undefined && !this.isTerminal(state.status)) {
      state.status = nextStatus;
      state.statusIndex += 1;
      if (nextStatus === "completed") {
        state.completedAt = Math.floor(this.now() / 1_000);
      }
      if (nextStatus === "failed" && state.failureMessage === null) {
        state.failureCode = "mock_render_failed";
        state.failureMessage = "Falha simulada pelo provider mock.";
      }
    }
    return this.toVideo(state);
  }

  waitForVideo(
    videoId: string,
    options: PollVideoOptions = {},
  ): Promise<VideoProviderVideo> {
    const safeVideoId = validateResourceId(videoId, "ID do vídeo mock");
    return pollVideoUntilTerminal(
      () => this.getVideo(safeVideoId),
      options,
      async () => Promise.resolve(),
    );
  }

  async handleWebhook(
    headers: WebhookHeaders,
    rawBody: Uint8Array,
  ): Promise<VideoWebhookEvent> {
    const event = verifyAndParseHeyGenWebhook(headers, rawBody, {
      secret: this.webhookSecret,
      maxAgeSeconds: this.webhookMaxAgeSeconds,
      now: this.now,
    });
    const state = this.videos.get(event.videoId);
    if (state !== undefined) {
      state.status = event.status;
      if (event.status === "completed") {
        state.completedAt = Math.floor(this.now() / 1_000);
      } else {
        state.failureCode = event.errorCode ?? "mock_webhook_failure";
        state.failureMessage =
          event.errorMessage ?? "Falha simulada por webhook mock.";
      }
    }
    return event;
  }

  async downloadCompletedVideo(videoId: string): Promise<VideoDownload> {
    const state = this.requireVideo(videoId);
    if (state.status !== "completed") {
      throw new VideoProviderError(
        `O vídeo mock ainda não está pronto (estado: ${state.status}).`,
        { code: "video_not_completed", retryable: true },
      );
    }

    const bytes = this.videoBytes.slice();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return {
      videoId: state.videoId,
      body,
      contentType: "video/mp4",
      contentLength: bytes.byteLength,
      fileName: `${state.videoId}.mp4`,
    };
  }

  async cancelVideo(videoId: string): Promise<CancelVideoResult> {
    const safeVideoId = validateResourceId(videoId, "ID do vídeo mock");
    this.requireVideo(safeVideoId);
    return { videoId: safeVideoId, supported: false, status: null };
  }

  completeVideo(videoId: string): VideoProviderVideo {
    const state = this.requireVideo(videoId);
    state.status = "completed";
    state.completedAt = Math.floor(this.now() / 1_000);
    return this.toVideo(state);
  }

  failVideo(videoId: string, message = "Falha mock solicitada."): VideoProviderVideo {
    const state = this.requireVideo(videoId);
    state.status = "failed";
    state.failureCode = "mock_render_failed";
    state.failureMessage = message;
    return this.toVideo(state);
  }

  private createResult(state: MockVideoState): CreateVideoResult {
    return {
      videoId: state.videoId,
      status: state.status,
      rawStatus: state.status,
      outputFormat: state.plan.outputFormat,
    };
  }

  private requireVideo(videoId: string): MockVideoState {
    const safeVideoId = validateResourceId(videoId, "ID do vídeo mock");
    const state = this.videos.get(safeVideoId);
    if (state === undefined) {
      throw new VideoProviderError("Vídeo mock não encontrado.", {
        code: "video_not_found",
      });
    }
    return state;
  }

  private toVideo(state: MockVideoState): VideoProviderVideo {
    const videoUrl =
      state.status === "completed"
        ? typeof this.videoUrl === "function"
          ? this.videoUrl(state.videoId)
          : this.videoUrl
        : null;
    return {
      videoId: state.videoId,
      status: state.status,
      rawStatus: state.status,
      title: state.plan.title,
      videoUrl,
      thumbnailUrl: null,
      captionedVideoUrl: null,
      subtitleUrl: null,
      durationSeconds: null,
      createdAt: state.createdAt,
      completedAt: state.completedAt,
      failureCode: state.failureCode,
      failureMessage: state.failureMessage,
    };
  }

  private isTerminal(status: VideoProviderStatus): boolean {
    return (
      status === "completed" || status === "failed" || status === "cancelled"
    );
  }
}
