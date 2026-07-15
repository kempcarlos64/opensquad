import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { VideoPlan } from "@/lib/domain";
import {
  DEFAULT_MOCK_AVATAR_ID,
  DEFAULT_MOCK_VOICE_ID,
  HeyGenProvider,
  MockVideoProvider,
} from "@/server/providers/video";

const PLAN: VideoPlan = {
  title: "Vídeo orgânico Besorah",
  script: "Conheça uma maneira mais simples de organizar o seu conteúdo.",
  avatarId: DEFAULT_MOCK_AVATAR_ID,
  voiceId: DEFAULT_MOCK_VOICE_ID,
  resolution: "1080p",
  aspectRatio: "9:16",
  outputFormat: "mp4",
  callbackId: "job-123",
  engine: "avatar_iv",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

describe("HeyGenProvider", () => {
  it("pagina looks e combina vozes públicas e privadas da API v3", async () => {
    const calls: URL[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = requestUrl(input);
      calls.push(url);
      if (url.pathname === "/v3/avatars/looks") {
        if (url.searchParams.get("token") === null) {
          return jsonResponse({
            data: [
              {
                id: "avatar-1",
                name: "Avatar um",
                default_voice_id: "voice-public",
                supported_api_engines: ["avatar_iv"],
              },
            ],
            has_more: true,
            next_token: "page-2",
          });
        }
        return jsonResponse({
          data: [{ id: "avatar-2", name: "Avatar dois" }],
          has_more: false,
          next_token: null,
        });
      }
      if (url.pathname === "/v3/voices") {
        const type = url.searchParams.get("type");
        return jsonResponse({
          data: [
            {
              voice_id: `voice-${type}`,
              name: `Voz ${type}`,
              language: "Portuguese (Brazil)",
              support_pause: true,
              support_locale: true,
            },
          ],
          has_more: false,
          next_token: null,
        });
      }
      throw new Error(`URL inesperada: ${url.toString()}`);
    };
    const provider = new HeyGenProvider({ apiKey: "server-key", fetchImpl });

    const avatars = await provider.listAvatars();
    const voices = await provider.listVoices();

    expect(avatars.map(({ id }) => id)).toEqual(["avatar-1", "avatar-2"]);
    expect(voices.map(({ type }) => type).sort()).toEqual(["private", "public"]);
    expect(
      calls.filter(({ pathname }) => pathname === "/v3/avatars/looks"),
    ).toHaveLength(2);
    expect(
      calls
        .filter(({ pathname }) => pathname === "/v3/voices")
        .map((url) => url.searchParams.get("type"))
        .sort(),
    ).toEqual(["private", "public"]);
  });

  it("cria vídeo v3 com idempotência e sem incluir a chave no payload", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      capturedInit = init;
      return jsonResponse({
        data: { video_id: "video-123", status: "pending", output_format: "mp4" },
      });
    };
    const provider = new HeyGenProvider({
      apiKey: "super-secret-server-key",
      callbackUrl: "https://app.example.com/api/webhooks/heygen",
      fetchImpl,
    });

    const result = await provider.createVideo(PLAN, "project:123.video-1");

    const headers = new Headers(capturedInit?.headers);
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(result).toMatchObject({ videoId: "video-123", status: "pending" });
    expect(capturedInit?.method).toBe("POST");
    expect(headers.get("idempotency-key")).toBe("project:123.video-1");
    expect(headers.get("x-api-key")).toBe("super-secret-server-key");
    expect(body).toMatchObject({
      type: "avatar",
      avatar_id: DEFAULT_MOCK_AVATAR_ID,
      voice_id: DEFAULT_MOCK_VOICE_ID,
      aspect_ratio: "9:16",
      resolution: "1080p",
      callback_id: "job-123",
      callback_url: "https://app.example.com/api/webhooks/heygen",
      engine: { type: "avatar_iv" },
    });
    expect(JSON.stringify(body)).not.toContain("super-secret-server-key");
  });

  it("faz polling com backoff exponencial até o estado terminal", async () => {
    const statuses = ["waiting", "processing", "completed"] as const;
    let statusIndex = 0;
    const delays: number[] = [];
    const fetchImpl: typeof fetch = async () => {
      const status = statuses[Math.min(statusIndex, statuses.length - 1)];
      statusIndex += 1;
      return jsonResponse({ data: { id: "video-poll", status } });
    };
    const provider = new HeyGenProvider({
      apiKey: "server-key",
      fetchImpl,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    const video = await provider.waitForVideo("video-poll", {
      initialDelayMs: 10,
      factor: 2,
      maxDelayMs: 20,
      maxAttempts: 4,
    });

    expect(video.status).toBe("completed");
    expect(delays).toEqual([10, 20]);
  });

  it("baixa a URL temporária por streaming sem enviar a API key", async () => {
    const calls: Array<{ url: URL; headers: Headers }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      calls.push({ url, headers: new Headers(init?.headers) });
      if (url.hostname === "api.heygen.test") {
        return jsonResponse({
          data: {
            id: "video-download",
            status: "completed",
            video_url: "https://cdn.heygen.test/signed/video-download.mp4?token=tmp",
          },
        });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: {
          "content-type": "video/mp4",
          "content-length": "4",
        },
      });
    };
    const provider = new HeyGenProvider({
      apiKey: "server-key",
      baseUrl: "https://api.heygen.test",
      fetchImpl,
    });

    const download = await provider.downloadCompletedVideo("video-download");
    const bytes = new Uint8Array(await new Response(download.body).arrayBuffer());

    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(download.contentLength).toBe(4);
    expect(download.fileName).toBe("video-download.mp4");
    expect(calls[0]?.headers.get("x-api-key")).toBe("server-key");
    expect(calls[1]?.headers.has("x-api-key")).toBe(false);
  });

  it("autentica o corpo bruto do webhook e rejeita assinatura ou tempo inválidos", async () => {
    const now = 1_800_000_000_000;
    const timestamp = String(now / 1_000);
    const secret = "whsec_test_only";
    const rawBody = Buffer.from(
      JSON.stringify({
        event_id: "evt-1",
        event_type: "avatar_video.success",
        event_data: {
          video_id: "video-webhook",
          url: "https://cdn.heygen.test/video-webhook.mp4",
          callback_id: "job-123",
        },
        created_at: "2027-01-15T08:00:00Z",
      }),
    );
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provider = new HeyGenProvider({
      apiKey: "server-key",
      webhookSecret: secret,
      now: () => now,
    });
    const headers = {
      "heygen-signature": signature,
      "Heygen-Timestamp": timestamp,
      "HEYGEN-EVENT-ID": "evt-1",
    };

    const event = await provider.handleWebhook(headers, rawBody);

    expect(event).toMatchObject({
      eventId: "evt-1",
      videoId: "video-webhook",
      status: "completed",
      callbackId: "job-123",
    });

    const failedRawBody = Buffer.from(
      JSON.stringify({
        event_id: "evt-2",
        event_type: "avatar_video.fail",
        event_data: {
          video_id: "video-webhook",
          failure_code: "render_failed",
          failure_message: "Render indisponível",
        },
      }),
    );
    const failedSignature = createHmac("sha256", secret)
      .update(failedRawBody)
      .digest("hex");
    await expect(
      provider.handleWebhook(
        {
          "Heygen-Signature": failedSignature,
          "Heygen-Timestamp": timestamp,
          "Heygen-Event-Id": "evt-2",
        },
        failedRawBody,
      ),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "render_failed",
      errorMessage: "Render indisponível",
    });
    await expect(
      provider.handleWebhook(headers, Buffer.from(`${rawBody.toString()} `)),
    ).rejects.toMatchObject({ code: "webhook_signature_invalid" });
    await expect(
      provider.handleWebhook(
        { ...headers, "Heygen-Timestamp": String(now / 1_000 - 301) },
        rawBody,
      ),
    ).rejects.toMatchObject({ code: "webhook_timestamp_invalid" });
  });
});

describe("MockVideoProvider", () => {
  it("executa o fluxo completo em memória e deduplica clique duplo", async () => {
    const provider = new MockVideoProvider();

    const first = await provider.createVideo(PLAN, "same-click-key");
    const duplicate = await provider.createVideo(
      { ...PLAN, title: "Corpo diferente, mesma chave" },
      "same-click-key",
    );
    const completed = await provider.waitForVideo(first.videoId, {
      maxAttempts: 5,
    });
    const download = await provider.downloadCompletedVideo(first.videoId);

    expect(duplicate.videoId).toBe(first.videoId);
    expect(completed.status).toBe("completed");
    expect(download.contentType).toBe("video/mp4");
    expect(download.contentLength).toBeGreaterThan(0);
    await expect(provider.cancelVideo(first.videoId)).resolves.toMatchObject({
      supported: false,
    });
  });
});
