import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { getProjectDetail, getVideoJob } from "@/server/db/repository";
import { syncVideoJob } from "@/server/services/video-jobs";

export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { jobId } = await context.params;
    const existing = await getVideoJob(jobId);
    if (!existing) throw new Error("Video job not found");
    await syncVideoJob(jobId);
    return NextResponse.json(await getProjectDetail(existing.projectId));
  } catch (error) {
    return apiError(error, "video.poll_failed");
  }
}
