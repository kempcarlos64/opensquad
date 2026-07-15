import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { getProjectDetail } from "@/server/db/repository";
import { generateScriptsForProject } from "@/server/orchestration/generate-scripts";

export const runtime = "nodejs";
export const maxDuration = 120;

type Context = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    await generateScriptsForProject(projectId);
    return NextResponse.json(await getProjectDetail(projectId));
  } catch (error) {
    return apiError(error, "scripts.generate_failed");
  }
}
