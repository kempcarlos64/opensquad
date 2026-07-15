import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { getProjectDetail, getVideoJob } from "@/server/db/repository";
import { cancelVideoJob } from "@/server/services/video-jobs";

export const runtime = "nodejs";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { jobId } = await context.params;
    const job = await getVideoJob(jobId);
    if (!job) throw new Error("Video job not found");
    await cancelVideoJob(jobId);
    return NextResponse.json(await getProjectDetail(job.projectId));
  } catch (error) {
    return apiError(error, "video.cancel_failed");
  }
}
