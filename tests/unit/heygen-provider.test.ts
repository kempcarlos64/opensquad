import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { VideoPlan } from "@/lib/domain";
import {
  DEFAULT_MOCK_AVATAR_ID,
  DEFAULT_MOCK_VOICE_ID,
  getVideoProvider,
  HeyGenProvider,
  MockVideoProvider,
  resetVideoProviderForTests,
} from "@/server/providers/video";
import { resetEnvForTests } from "@/server/env";

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

const VALID_MP4 = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
]);

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
                status: "completed",
              },
              {
                id: "avatar-training",
                name: "Ainda treinando",
                status: "pending",
              },
            ],
            has_more: true,
            next_token: "page-2",
          });
        }
        return jsonResponse({
          data: [{ id: "avatar-2", name: "Avatar dois", status: "completed" }],
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

  it("tolera metadados incompletos e o envelope legado sem aceitar voz sem ID", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = requestUrl(input);
      const type = url.searchParams.get("type");
      if (url.pathname !== "/v3/voices") {
        throw new Error(`URL inesperada: ${url.toString()}`);
      }
      if (type === "public") {
        return jsonResponse({
          data: [
            {
              voice_id: "voice-public-minimal",
              name: null,
              language: " ",
              gender: null,
              support_pause: null,
            },
            { name: "Registro sem ID", language: "Portuguese (Brazil)" },
          ],
          has_more: false,
          next_token: null,
        });
      }
      return jsonResponse({
        data: {
          voices: [
            {
              voice_id: "voice-private-legacy",
              name: "Voz privada",
              language: "Portuguese (Brazil)",
              preview_audio: "https://cdn.heygen.test/voice.mp3",
            },
          ],
          has_more: false,
          next_token: null,
        },
      });
    };
    const provider = new HeyGenProvider({ apiKey: "server-key", fetchImpl });

    const voices = await provider.listVoices();

    expect(voices).toEqual([
      {
        id: "voice-public-minimal",
        name: "Voz HeyGen (-minimal)",
        language: "",
        gender: null,
        type: "public",
        supportsPause: false,
        supportsLocale: false,
        previewAudioUrl: null,
      },
      {
        id: "voice-private-legacy",
        name: "Voz privada",
        language: "Portuguese (Brazil)",
        gender: null,
        type: "private",
        supportsPause: false,
        supportsLocale: false,
        previewAudioUrl: "https://cdn.heygen.test/voice.mp3",
      },
    ]);
  });

  it("cria vídeo v3 com idempotência e sem incluir a chave no payload", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === "/v3/avatars/looks") {
        return jsonResponse({
          data: [
            {
              id: DEFAULT_MOCK_AVATAR_ID,
              name: "Avatar real selecionado",
              supported_api_engines: ["avatar_iv"],
              status: "completed",
            },
          ],
          has_more: false,
        });
      }
      if (url.pathname === "/v3/voices") {
        return jsonResponse({
          data: [
            {
              voice_id: DEFAULT_MOCK_VOICE_ID,
              name: "Voz real selecionada",
              language: "Portuguese (Brazil)",
            },
          ],
          has_more: false,
        });
      }
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

    const result = await provider.createVideo(
      { ...PLAN, engine: null },
      "project:123.video-1",
    );

    const headers = new Headers(capturedInit?.headers);
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(result).toMatchObject({ videoId: "video-123", status: "pending" });
    expect(provider.mode).toBe("real");
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

  it("recusa avatar, voz ou engine fora do catálogo real atual", async () => {
    let postCount = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname === "/v3/avatars/looks") {
        return jsonResponse({
          data: [
            {
              id: "live-avatar",
              name: "Avatar disponível",
              supported_api_engines: ["avatar_iv"],
              status: "completed",
            },
          ],
          has_more: false,
        });
      }
      if (url.pathname === "/v3/voices") {
        return jsonResponse({
          data: [
            {
              voice_id: "live-voice",
              name: "Voz disponível",
              language: "Portuguese (Brazil)",
            },
          ],
          has_more: false,
        });
      }
      if (init?.method === "POST") {
        postCount += 1;
      }
      return jsonResponse({
        data: { video_id: "should-not-exist", status: "pending" },
      });
    };
    const provider = new HeyGenProvider({ apiKey: "server-key", fetchImpl });

    await expect(
      provider.createVideo(
        { ...PLAN, avatarId: "live-avatar", voiceId: "missing-voice" },
        "invalid-voice",
      ),
    ).rejects.toMatchObject({ code: "voice_not_available" });
    await expect(
      provider.createVideo(
        {
          ...PLAN,
          avatarId: "live-avatar",
          voiceId: "live-voice",
          engine: "avatar_v",
        },
        "invalid-engine",
      ),
    ).rejects.toMatchObject({ code: "avatar_engine_not_supported" });
    await expect(
      provider.createVideo(
        { ...PLAN, avatarId: "missing-avatar", voiceId: "live-voice" },
        "invalid-avatar",
      ),
    ).rejects.toMatchObject({ code: "avatar_not_available" });
    expect(postCount).toBe(0);
  });

  it("recusa IDs em branco antes de fazer chamada externa", async () => {
    let calls = 0;
    const provider = new HeyGenProvider({
      apiKey: "server-key",
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });

    await expect(
      provider.createVideo({ ...PLAN, avatarId: "   " }, "blank-avatar"),
    ).rejects.toMatchObject({ code: "invalid_resource_id" });
    expect(calls).toBe(0);
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
      return new Response(VALID_MP4, {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(VALID_MP4.byteLength),
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

    expect([...bytes]).toEqual([...VALID_MP4]);
    expect(download.contentLength).toBe(VALID_MP4.byteLength);
    expect(download.fileName).toBe("video-download.mp4");
    expect(calls[0]?.headers.get("x-api-key")).toBe("server-key");
    expect(calls[1]?.headers.has("x-api-key")).toBe(false);
  });

  it("rejeita download que não seja MP4 real, mesmo com HTTP 200", async () => {
    const providerFor = (contentType: string, bytes: Uint8Array) =>
      new HeyGenProvider({
        apiKey: "server-key",
        baseUrl: "https://api.heygen.test",
        fetchImpl: async (input) => {
          const url = requestUrl(input);
          if (url.hostname === "api.heygen.test") {
            return jsonResponse({
              data: {
                id: "video-invalid-media",
                status: "completed",
                video_url: "https://cdn.heygen.test/video-invalid-media.mp4",
              },
            });
          }
          return new Response(new Uint8Array([...bytes]), {
            headers: { "content-type": contentType },
          });
        },
      });

    await expect(
      providerFor("text/html", VALID_MP4).downloadCompletedVideo(
        "video-invalid-media",
      ),
    ).rejects.toMatchObject({ code: "video_media_type_invalid" });
    await expect(
      providerFor(
        "video/mp4",
        new TextEncoder().encode("not-an-mp4-file"),
      ).downloadCompletedVideo("video-invalid-media"),
    ).rejects.toMatchObject({ code: "video_media_invalid" });
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
    expect(provider.mode).toBe("mock");

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

  it("só ativa o provider real quando a feature flag está ligada", () => {
    const previousFlag = process.env.HEYGEN_REAL_CALLS_ENABLED;
    const previousKey = process.env.HEYGEN_API_KEY;
    try {
      process.env.HEYGEN_API_KEY = "test-only-key";
      process.env.HEYGEN_REAL_CALLS_ENABLED = "false";
      resetEnvForTests();
      resetVideoProviderForTests();
      expect(getVideoProvider().mode).toBe("mock");

      process.env.HEYGEN_REAL_CALLS_ENABLED = "true";
      resetEnvForTests();
      resetVideoProviderForTests();
      expect(getVideoProvider().mode).toBe("real");
    } finally {
      if (previousFlag === undefined) {
        delete process.env.HEYGEN_REAL_CALLS_ENABLED;
      } else {
        process.env.HEYGEN_REAL_CALLS_ENABLED = previousFlag;
      }
      if (previousKey === undefined) {
        delete process.env.HEYGEN_API_KEY;
      } else {
        process.env.HEYGEN_API_KEY = previousKey;
      }
      resetEnvForTests();
      resetVideoProviderForTests();
    }
  });
});
