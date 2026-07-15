import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { getVideoProvider } from "@/server/providers/video";

export const runtime = "nodejs";

export async function GET() {
  try {
    const provider = getVideoProvider();
    const [avatars, voices] = await Promise.all([
      provider.listAvatars(),
      provider.listVoices(),
    ]);
    return NextResponse.json({
      mode: provider.mode,
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
      })),
    });
  } catch (error) {
    return apiError(error, "video_options.list_failed");
  }
}
