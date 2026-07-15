import { NextResponse } from "next/server";

import { createProjectRequestSchema } from "@/lib/api-contracts";
import { apiError } from "@/server/api/response";
import { createProject, getProjectDetail, listProjects } from "@/server/db/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    return apiError(error, "projects.list_failed");
  }
}

export async function POST(request: Request) {
  try {
    const input = createProjectRequestSchema.parse(await request.json());
    const project = await createProject({
      title: input.title,
      brief: input.brief,
      avatarId: input.avatarId,
      voiceId: input.voiceId,
    });
    const detail = await getProjectDetail(project.id);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return apiError(error, "project.create_failed");
  }
}
