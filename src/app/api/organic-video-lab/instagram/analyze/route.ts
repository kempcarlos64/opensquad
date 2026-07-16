import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { analyzeInstagramLink } from "@/server/services/instagram-discovery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    return NextResponse.json(await analyzeInstagramLink(await request.json()));
  } catch (error) {
    return apiError(error, "instagram.analyze_failed");
  }
}
