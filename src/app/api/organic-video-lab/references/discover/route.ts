import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import {
  discoverReferenceCandidates,
  referenceDiscoveryInputSchema,
} from "@/server/services/reference-discovery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = referenceDiscoveryInputSchema.parse(await request.json());
    return NextResponse.json(await discoverReferenceCandidates(input));
  } catch (error) {
    return apiError(error, "references.discover_failed");
  }
}
