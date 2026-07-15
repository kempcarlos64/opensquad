import { NextResponse } from "next/server";

import { updateProjectRequestSchema } from "@/lib/api-contracts";
import { apiError } from "@/server/api/response";
import {
  addAuditEvent,
  getProjectDetail,
  updateProject,
} from "@/server/db/repository";

export const runtime = "nodejs";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const detail = await getProjectDetail(projectId);
    if (!detail) throw new Error("Project not found");
    return NextResponse.json(detail);
  } catch (error) {
    return apiError(error, "project.get_failed");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const input = updateProjectRequestSchema.parse(await request.json());
    const detail = await getProjectDetail(projectId);
    if (!detail) throw new Error("Project not found");
    await updateProject(projectId, { finalScriptJson: input.finalScript });
    await addAuditEvent(projectId, "script.edited", {
      characters: input.finalScript.spoken_script.length,
    });
    return NextResponse.json(await getProjectDetail(projectId));
  } catch (error) {
    return apiError(error, "project.update_failed");
  }
}
