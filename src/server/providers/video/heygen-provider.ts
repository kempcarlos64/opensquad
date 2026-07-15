import { z } from "zod";

import type { VideoPlan } from "@/lib/domain";

import {
  VideoProviderError,
  VideoProviderHttpError,
} from "./errors";
import {
  defaultSleep,
  normalizeVideoStatus,
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
  VideoProviderVideo,
  VideoProviderVoice,
  VideoWebhookEvent,
  WebhookHeaders,
} from "./types";
import { verifyAndParseHeyGenWebhook } from "./webhook";

const avatarItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    group_id: z.string().nullish(),
    preview_image_url: z.string().nullish(),
    preview_video_url: z.string().nullish(),
    gender: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    default_voice_id: z.string().nullish(),
    supported_api_engines: z.array(z.string()).nullish(),
    image_width: z.number().int().positive().nullish(),
    image_height: z.number().int().positive().nullish(),
  })
  .passthrough();

const voiceItemSchema = z
  .object({
    voice_id: z.string().min(1),
    name: z.string().min(1),
    language: z.string().min(1),
    gender: z.string().nullish(),
    support_pause: z.boolean().nullish(),
    support_locale: z.boolean().nullish(),
    preview_audio_url: z.string().nullish(),
  })
  .passthrough();

const avatarPageSchema = z
  .object({
    data: z.array(avatarItemSchema),
    has_more: z.boolean().optional().default(false),
    next_token: z.string().nullish(),
  })
  .passthrough();

const voicePageSchema = z
  .object({
    data: z.array(voiceItemSchema),
    has_more: z.boolean().optional().default(false),
    next_token: z.string().nullish(),
  })
  .passthrough();

const createVideoResponseSchema = z
  .object({
    data: z
      .object({
        video_id: z.string().min(1),
        status: z.string().min(1),
        output_format: z.enum(["mp4", "webm"]).optional().default("mp4"),
      })
      .passthrough(),
  })
  .passthrough();

const getVideoResponseSchema = z
  .object({
    data: z
      .object({
        id: z.string().min(1),
        status: z.string().min(1),
        title: z.string().nullish(),
        created_at: z.number().nullish(),
        completed_at: z.number().nullish(),
        video_url: z.string().nullish(),
        thumbnail_url: z.string().nullish(),
        captioned_video_url: z.string().nullish(),
        subtitle_url: z.string().nullish(),
        duration: z.number().nonnegative().nullish(),
        failure_code: z.string().nullish(),
        failure_message: z.string().nullish(),
      })
      .passthrough(),
  })
  .passthrough();

const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
      })
      .passthrough(),
  })
  .passthrough();

type Sleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

export type HeyGenProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  webhookSecret?: string;
  webhookMaxAgeSeconds?: number;
  callbackUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: Sleep;
};

function validateHttpUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new VideoProviderError(`${label} inválida.`, {
      code: "invalid_provider_url",
      cause: error,
    });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new VideoProviderError(`${label} deve usar HTTP ou HTTPS.`, {
      code: "invalid_provider_url",
    });
  }
  return url.toString();
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function fileNameForVideo(videoId: string, videoUrl: URL): string {
  const lastSegment = videoUrl.pathname.split("/").at(-1);
  if (lastSegment !== undefined && /\.mp4$/i.test(lastSegment)) {
    try {
      const decoded = decodeURIComponent(lastSegment).replace(
        /[^A-Za-z0-9_.-]/g,
        "_",
      );
      if (decoded.length > 0) {
        return decoded;
      }
    } catch {
      // Use the provider id below when the signed URL contains bad escaping.
    }
  }
  return `${videoId.replace(/[^A-Za-z0-9_.-]/g, "_")}.mp4`;
}

export class HeyGenProvider implements VideoProvider {
  readonly name = "heygen" as const;
  readonly mode = "real" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string | null;
  private readonly webhookMaxAgeSeconds: number;
  private readonly callbackUrl: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: Sleep;

  constructor(config: HeyGenProviderConfig) {
    const apiKey = config.apiKey.trim();
    if (apiKey.length === 0) {
      throw new VideoProviderError("A chave da API HeyGen não está configurada.", {
        code: "heygen_api_key_missing",
      });
    }

    this.apiKey = apiKey;
    this.baseUrl = validateHttpUrl(
      config.baseUrl ?? "https://api.heygen.com",
      "URL base da HeyGen",
    );
    this.webhookSecret = config.webhookSecret?.trim() || null;
    this.webhookMaxAgeSeconds = config.webhookMaxAgeSeconds ?? 300;
    this.callbackUrl =
      config.callbackUrl === undefined
        ? null
        : validateHttpUrl(config.callbackUrl, "URL de callback da HeyGen");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
    this.sleep = config.sleep ?? defaultSleep;
  }

  async listAvatars(): Promise<VideoProviderAvatar[]> {
    const avatars: VideoProviderAvatar[] = [];
    let token: string | null = null;

    for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
      const url = this.apiUrl("v3/avatars/looks");
      url.searchParams.set("limit", "50");
      if (token !== null) {
        url.searchParams.set("token", token);
      }

      const response = avatarPageSchema.safeParse(await this.requestJson(url));
      if (!response.success) {
        throw new VideoProviderError(
          "Resposta da listagem de avatares HeyGen inválida.",
          { code: "heygen_payload_invalid", cause: response.error },
        );
      }

      avatars.push(
        ...response.data.data.map((avatar) => ({
          id: avatar.id,
          name: avatar.name,
          groupId: avatar.group_id ?? null,
          previewImageUrl: avatar.preview_image_url ?? null,
          previewVideoUrl: avatar.preview_video_url ?? null,
          gender: avatar.gender ?? null,
          tags: avatar.tags ?? [],
          defaultVoiceId: avatar.default_voice_id ?? null,
          supportedApiEngines: avatar.supported_api_engines ?? [],
          imageWidth: avatar.image_width ?? null,
          imageHeight: avatar.image_height ?? null,
        })),
      );

      if (!response.data.has_more) {
        return avatars;
      }
      token = response.data.next_token ?? null;
      if (token === null) {
        throw new VideoProviderError(
          "A paginação de avatares HeyGen não retornou o próximo token.",
          { code: "heygen_pagination_invalid" },
        );
      }
    }

    throw new VideoProviderError(
      "A listagem de avatares HeyGen excedeu o limite seguro de páginas.",
      { code: "heygen_pagination_limit" },
    );
  }

  async listVoices(): Promise<VideoProviderVoice[]> {
    const [publicVoices, privateVoices] = await Promise.all([
      this.listVoicesByType("public"),
      this.listVoicesByType("private"),
    ]);
    const voicesById = new Map<string, VideoProviderVoice>();
    for (const voice of [...publicVoices, ...privateVoices]) {
      voicesById.set(voice.id, voice);
    }
    return [...voicesById.values()];
  }

  async createVideo(
    plan: VideoPlan,
    idempotencyKey: string,
  ): Promise<CreateVideoResult> {
    const parsedPlan = validateVideoPlan(plan);
    const safeIdempotencyKey = validateIdempotencyKey(idempotencyKey);
    const body: Record<string, unknown> = {
      type: "avatar",
      avatar_id: parsedPlan.avatarId,
      title: parsedPlan.title,
      resolution: parsedPlan.resolution,
      aspect_ratio: parsedPlan.aspectRatio,
      output_format: parsedPlan.outputFormat,
      script: parsedPlan.script,
      voice_id: parsedPlan.voiceId,
      callback_id: parsedPlan.callbackId,
      caption: { file_format: "srt" },
    };
    if (parsedPlan.engine !== null) {
      body.engine = { type: parsedPlan.engine };
    }
    if (this.callbackUrl !== null) {
      body.callback_url = this.callbackUrl;
    }

    const response = createVideoResponseSchema.safeParse(
      await this.requestJson(this.apiUrl("v3/videos"), {
        method: "POST",
        headers: { "Idempotency-Key": safeIdempotencyKey },
        body: JSON.stringify(body),
      }),
    );
    if (!response.success) {
      throw new VideoProviderError(
        "Resposta da criação de vídeo HeyGen inválida.",
        { code: "heygen_payload_invalid", cause: response.error },
      );
    }

    return {
      videoId: response.data.data.video_id,
      status: normalizeVideoStatus(response.data.data.status),
      rawStatus: response.data.data.status,
      outputFormat: response.data.data.output_format,
    };
  }

  async getVideo(videoId: string): Promise<VideoProviderVideo> {
    const safeVideoId = validateResourceId(videoId, "ID do vídeo");
    const response = getVideoResponseSchema.safeParse(
      await this.requestJson(
        this.apiUrl(`v3/videos/${encodeURIComponent(safeVideoId)}`),
      ),
    );
    if (!response.success) {
      throw new VideoProviderError(
        "Resposta do status de vídeo HeyGen inválida.",
        { code: "heygen_payload_invalid", cause: response.error },
      );
    }

    const video = response.data.data;
    return {
      videoId: video.id,
      status: normalizeVideoStatus(video.status),
      rawStatus: video.status,
      title: video.title ?? null,
      videoUrl: video.video_url ?? null,
      thumbnailUrl: video.thumbnail_url ?? null,
      captionedVideoUrl: video.captioned_video_url ?? null,
      subtitleUrl: video.subtitle_url ?? null,
      durationSeconds: video.duration ?? null,
      createdAt: video.created_at ?? null,
      completedAt: video.completed_at ?? null,
      failureCode: video.failure_code ?? null,
      failureMessage: video.failure_message ?? null,
    };
  }

  waitForVideo(
    videoId: string,
    options: PollVideoOptions = {},
  ): Promise<VideoProviderVideo> {
    const safeVideoId = validateResourceId(videoId, "ID do vídeo");
    return pollVideoUntilTerminal(
      () => this.getVideo(safeVideoId),
      options,
      this.sleep,
    );
  }

  async handleWebhook(
    headers: WebhookHeaders,
    rawBody: Uint8Array,
  ): Promise<VideoWebhookEvent> {
    return verifyAndParseHeyGenWebhook(headers, rawBody, {
      secret: this.webhookSecret ?? "",
      maxAgeSeconds: this.webhookMaxAgeSeconds,
      now: this.now,
    });
  }

  async downloadCompletedVideo(videoId: string): Promise<VideoDownload> {
    const video = await this.getVideo(videoId);
    if (video.status !== "completed") {
      throw new VideoProviderError(
        `O vídeo HeyGen ainda não está pronto (estado: ${video.status}).`,
        { code: "video_not_completed", retryable: true },
      );
    }
    if (video.videoUrl === null) {
      throw new VideoProviderError(
        "A HeyGen marcou o vídeo como concluído sem fornecer a URL temporária.",
        { code: "video_download_url_missing", retryable: true },
      );
    }

    const downloadUrl = new URL(
      validateHttpUrl(video.videoUrl, "URL temporária do vídeo HeyGen"),
    );
    let response: Response;
    try {
      response = await this.fetchImpl(downloadUrl, {
        method: "GET",
        headers: { Accept: "video/mp4" },
        redirect: "follow",
      });
    } catch (error) {
      throw new VideoProviderError(
        "Não foi possível baixar o vídeo concluído da HeyGen.",
        { code: "video_download_failed", retryable: true, cause: error },
      );
    }
    if (!response.ok || response.body === null) {
      throw new VideoProviderHttpError(
        `O download do vídeo HeyGen falhou com HTTP ${response.status}.`,
        {
          statusCode: response.status,
          providerCode: "video_download_failed",
          retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
        },
      );
    }

    const contentLengthHeader = response.headers.get("content-length");
    const contentLength =
      contentLengthHeader === null ? null : Number(contentLengthHeader);
    return {
      videoId: video.videoId,
      body: response.body,
      contentType: response.headers.get("content-type"),
      contentLength:
        contentLength !== null &&
        Number.isSafeInteger(contentLength) &&
        contentLength >= 0
          ? contentLength
          : null,
      fileName: fileNameForVideo(video.videoId, downloadUrl),
    };
  }

  async cancelVideo(videoId: string): Promise<CancelVideoResult> {
    const safeVideoId = validateResourceId(videoId, "ID do vídeo");
    return { videoId: safeVideoId, supported: false, status: null };
  }

  private async listVoicesByType(
    type: "public" | "private",
  ): Promise<VideoProviderVoice[]> {
    const voices: VideoProviderVoice[] = [];
    let token: string | null = null;

    for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
      const url = this.apiUrl("v3/voices");
      url.searchParams.set("type", type);
      url.searchParams.set("limit", "100");
      if (token !== null) {
        url.searchParams.set("token", token);
      }

      const response = voicePageSchema.safeParse(await this.requestJson(url));
      if (!response.success) {
        throw new VideoProviderError(
          "Resposta da listagem de vozes HeyGen inválida.",
          { code: "heygen_payload_invalid", cause: response.error },
        );
      }

      voices.push(
        ...response.data.data.map((voice) => ({
          id: voice.voice_id,
          name: voice.name,
          language: voice.language,
          gender: voice.gender ?? null,
          type,
          supportsPause: voice.support_pause ?? false,
          supportsLocale: voice.support_locale ?? false,
          previewAudioUrl: voice.preview_audio_url ?? null,
        })),
      );

      if (!response.data.has_more) {
        return voices;
      }
      token = response.data.next_token ?? null;
      if (token === null) {
        throw new VideoProviderError(
          "A paginação de vozes HeyGen não retornou o próximo token.",
          { code: "heygen_pagination_invalid" },
        );
      }
    }

    throw new VideoProviderError(
      "A listagem de vozes HeyGen excedeu o limite seguro de páginas.",
      { code: "heygen_pagination_limit" },
    );
  }

  private apiUrl(path: string): URL {
    const baseUrl = this.baseUrl.endsWith("/")
      ? this.baseUrl
      : `${this.baseUrl}/`;
    return new URL(path.replace(/^\/+/, ""), baseUrl);
  }

  private async requestJson(
    url: URL,
    init: RequestInit = {},
  ): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("x-api-key", this.apiKey);
    if (init.body !== undefined && init.body !== null) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, headers });
    } catch (error) {
      throw new VideoProviderError("Falha de rede ao acessar a HeyGen.", {
        code: "heygen_network_error",
        retryable: true,
        cause: error,
      });
    }

    const responseText = await response.text();
    let payload: unknown = null;
    if (responseText.length > 0) {
      try {
        payload = JSON.parse(responseText) as unknown;
      } catch (error) {
        if (response.ok) {
          throw new VideoProviderError("A HeyGen retornou JSON inválido.", {
            code: "heygen_payload_invalid",
            cause: error,
          });
        }
      }
    }

    if (!response.ok) {
      const parsedError = apiErrorSchema.safeParse(payload);
      const providerCode = parsedError.success
        ? (parsedError.data.error.code ?? null)
        : null;
      const serverMessage = parsedError.success
        ? (parsedError.data.error.message ?? null)
        : null;
      const safeMessage =
        serverMessage === null
          ? `A HeyGen recusou a solicitação com HTTP ${response.status}.`
          : serverMessage.replaceAll(this.apiKey, "[redacted]").slice(0, 500);
      throw new VideoProviderHttpError(safeMessage, {
        statusCode: response.status,
        providerCode,
        retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
      });
    }

    return payload;
  }
}
