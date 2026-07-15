import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { getProjectDetail } from "@/server/db/repository";
import { renderProjectVideo } from "@/server/services/render-job";

export const runtime = "nodejs";
export const maxDuration = 300;

type Context = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    await renderProjectVideo(projectId);
    return NextResponse.json(await getProjectDetail(projectId));
  } catch (error) {
    return apiError(error, "render.request_failed");
  }
}
