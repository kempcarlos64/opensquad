import { NextResponse } from "next/server";

import { createVideoRequestSchema } from "@/lib/api-contracts";
import { apiError } from "@/server/api/response";
import { getProjectDetail } from "@/server/db/repository";
import { requestVideoForProject } from "@/server/services/video-jobs";

export const runtime = "nodejs";
export const maxDuration = 120;

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const input = createVideoRequestSchema.parse(await request.json());
    await requestVideoForProject({
      projectId,
      avatarId: input.avatarId,
      voiceId: input.voiceId,
      retryFailed: input.retryFailed,
    });
    return NextResponse.json(await getProjectDetail(projectId));
  } catch (error) {
    return apiError(error, "video.request_failed");
  }
}
