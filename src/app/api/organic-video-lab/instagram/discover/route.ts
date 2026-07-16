import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { discoverInstagramReferences } from "@/server/services/instagram-discovery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return NextResponse.json(await discoverInstagramReferences(await request.json()));
  } catch (error) {
    return apiError(error, "instagram.discover_failed");
  }
}
