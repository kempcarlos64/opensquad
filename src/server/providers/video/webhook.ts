import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { VideoProviderError } from "./errors";
import type { VideoWebhookEvent, WebhookHeaders } from "./types";

const webhookEventSchema = z
  .object({
    event_id: z.string().min(1).optional(),
    event_type: z.enum(["avatar_video.success", "avatar_video.fail"]),
    event_data: z.record(z.string(), z.unknown()),
    created_at: z.string().nullable().optional(),
  })
  .passthrough();

export type VerifyHeyGenWebhookOptions = {
  secret: string;
  maxAgeSeconds?: number;
  now?: () => number;
};

function getHeader(headers: WebhookHeaders, requestedName: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(requestedName);
  }

  const requested = requestedName.toLowerCase();
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== requested || value === undefined) {
      continue;
    }
    return typeof value === "string" ? value : (value[0] ?? null);
  }
  return null;
}

function optionalString(
  payload: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nestedErrorValue(
  payload: Readonly<Record<string, unknown>>,
  key: "code" | "message",
): string | null {
  const error = payload.error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return null;
  }
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function verifyAndParseHeyGenWebhook(
  headers: WebhookHeaders,
  rawBody: Uint8Array,
  options: VerifyHeyGenWebhookOptions,
): VideoWebhookEvent {
  const secret = options.secret.trim();
  if (secret.length === 0) {
    throw new VideoProviderError(
      "O segredo de assinatura do webhook HeyGen não está configurado.",
      { code: "webhook_secret_missing" },
    );
  }

  const signature = getHeader(headers, "Heygen-Signature");
  const timestampHeader = getHeader(headers, "Heygen-Timestamp");
  const eventId = getHeader(headers, "Heygen-Event-Id");
  if (signature === null || timestampHeader === null || eventId === null) {
    throw new VideoProviderError(
      "Cabeçalhos obrigatórios do webhook HeyGen estão ausentes.",
      { code: "webhook_headers_missing" },
    );
  }

  if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
    throw new VideoProviderError("Assinatura do webhook HeyGen inválida.", {
      code: "webhook_signature_invalid",
    });
  }

  const timestamp = Number(timestampHeader);
  const maxAgeSeconds = options.maxAgeSeconds ?? 300;
  const nowSeconds = (options.now ?? Date.now)() / 1_000;
  if (
    !Number.isInteger(timestamp) ||
    timestamp <= 0 ||
    !Number.isFinite(maxAgeSeconds) ||
    maxAgeSeconds <= 0 ||
    Math.abs(nowSeconds - timestamp) > maxAgeSeconds
  ) {
    throw new VideoProviderError(
      "Timestamp do webhook HeyGen inválido ou expirado.",
      { code: "webhook_timestamp_invalid" },
    );
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(rawBody)
    .digest();
  const providedSignature = Buffer.from(signature, "hex");
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new VideoProviderError("Assinatura do webhook HeyGen inválida.", {
      code: "webhook_signature_invalid",
    });
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(rawBody).toString("utf8")) as unknown;
  } catch (error) {
    throw new VideoProviderError("Corpo JSON do webhook HeyGen inválido.", {
      code: "webhook_body_invalid",
      cause: error,
    });
  }

  const parsed = webhookEventSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new VideoProviderError(
      "Payload do webhook HeyGen não corresponde ao contrato esperado.",
      { code: "webhook_payload_invalid", cause: parsed.error },
    );
  }
  if (parsed.data.event_id !== undefined && parsed.data.event_id !== eventId) {
    throw new VideoProviderError(
      "O identificador do webhook HeyGen não corresponde ao cabeçalho.",
      { code: "webhook_event_id_mismatch" },
    );
  }

  const payload = parsed.data.event_data;
  const videoId = optionalString(payload, "video_id");
  if (videoId === null) {
    throw new VideoProviderError(
      "O webhook HeyGen não contém o identificador do vídeo.",
      { code: "webhook_video_id_missing" },
    );
  }

  const isSuccess = parsed.data.event_type === "avatar_video.success";
  return {
    eventId,
    eventType: parsed.data.event_type,
    videoId,
    status: isSuccess ? "completed" : "failed",
    callbackId: optionalString(payload, "callback_id"),
    videoUrl: optionalString(payload, "url"),
    errorCode:
      optionalString(payload, "failure_code") ??
      optionalString(payload, "error_code") ??
      nestedErrorValue(payload, "code"),
    errorMessage:
      optionalString(payload, "failure_message") ??
      optionalString(payload, "error_message") ??
      optionalString(payload, "message") ??
      nestedErrorValue(payload, "message"),
    occurredAt: parsed.data.created_at ?? null,
    payload,
  };
}
