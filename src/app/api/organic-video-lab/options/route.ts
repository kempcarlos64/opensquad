import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { getEnv } from "@/server/env";
import { getVideoProvider } from "@/server/providers/video";

export const runtime = "nodejs";

export async function GET() {
  try {
    const provider = getVideoProvider();
    const env = getEnv();
    const [avatars, voices] = await Promise.all([
      provider.listAvatars(),
      provider.listVoices(),
    ]);
    return NextResponse.json({
      mode: provider.mode,
      scriptMode: env.LLM_REAL_CALLS_ENABLED ? "openai" : "mock",
      researchEnabled: env.LLM_REAL_CALLS_ENABLED && env.REELS_RESEARCH_ENABLED,
      cancelSupported: false,
      avatars: avatars.map((avatar) => ({
        id: avatar.id,
        name: avatar.name,
        previewImageUrl: avatar.previewImageUrl,
      })),
      voices: voices.map((voice) => ({
        id: voice.id,
        name: voice.name,
        language: voice.language,
        gender: voice.gender,
        previewAudioUrl: voice.previewAudioUrl,
      })),
    });
  } catch (error) {
    return apiError(error, "video_options.list_failed");
  }
}
