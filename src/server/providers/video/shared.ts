import { videoPlanSchema } from "@/lib/domain";
import type { VideoPlan } from "@/lib/domain";

import { VideoProviderError } from "./errors";
import type {
  PollVideoOptions,
  VideoProviderStatus,
  VideoProviderVideo,
} from "./types";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_:.-]{1,255}$/;

export function validateVideoPlan(plan: VideoPlan): VideoPlan {
  const parsed = videoPlanSchema.safeParse(plan);
  if (!parsed.success) {
    throw new VideoProviderError("Plano de vídeo inválido.", {
      code: "invalid_video_plan",
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export function validateIdempotencyKey(idempotencyKey: string): string {
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new VideoProviderError(
      "A chave de idempotência deve ter de 1 a 255 caracteres seguros.",
      { code: "invalid_idempotency_key" },
    );
  }
  return idempotencyKey;
}

export function validateResourceId(value: string, kind: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 255) {
    throw new VideoProviderError(`${kind} inválido.`, {
      code: "invalid_resource_id",
    });
  }
  return normalized;
}

export function normalizeVideoStatus(rawStatus: string): VideoProviderStatus {
  switch (rawStatus.trim().toLowerCase()) {
    case "queued":
      return "queued";
    case "pending":
    case "waiting":
      return "pending";
    case "processing":
    case "rendering":
      return "processing";
    case "completed":
    case "success":
    case "succeeded":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      throw new VideoProviderError(
        `A HeyGen retornou um estado de vídeo não reconhecido: ${rawStatus}.`,
        { code: "unknown_video_status" },
      );
  }
}

export const defaultSleep = (
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new VideoProviderError("Polling cancelado.", {
          code: "polling_aborted",
          cause: signal.reason,
        }),
      );
      return;
    }

    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(
          new VideoProviderError("Polling cancelado.", {
            code: "polling_aborted",
            cause: signal.reason,
          }),
        );
      },
      { once: true },
    );
  });

export async function pollVideoUntilTerminal(
  getVideo: () => Promise<VideoProviderVideo>,
  options: PollVideoOptions = {},
  sleep: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void> = defaultSleep,
): Promise<VideoProviderVideo> {
  const initialDelayMs = options.initialDelayMs ?? 2_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const factor = options.factor ?? 1.8;
  const maxAttempts = options.maxAttempts ?? 20;

  if (
    !Number.isFinite(initialDelayMs) ||
    initialDelayMs < 0 ||
    !Number.isFinite(maxDelayMs) ||
    maxDelayMs < initialDelayMs ||
    !Number.isFinite(factor) ||
    factor < 1 ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1
  ) {
    throw new VideoProviderError("Configuração de polling inválida.", {
      code: "invalid_polling_options",
    });
  }

  let delayMs = initialDelayMs;
  let lastVideo: VideoProviderVideo | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new VideoProviderError("Polling cancelado.", {
        code: "polling_aborted",
        cause: options.signal.reason,
      });
    }

    lastVideo = await getVideo();
    if (
      lastVideo.status === "completed" ||
      lastVideo.status === "failed" ||
      lastVideo.status === "cancelled"
    ) {
      return lastVideo;
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs, options.signal);
      delayMs = Math.min(maxDelayMs, Math.ceil(delayMs * factor));
    }
  }

  throw new VideoProviderError(
    `O vídeo não terminou após ${maxAttempts} tentativas (último estado: ${lastVideo?.status ?? "desconhecido"}).`,
    { code: "polling_timeout", retryable: true },
  );
}
