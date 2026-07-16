import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { logger } from "@/server/logger";
import {
  discoverReferenceCandidates,
  fallbackReferenceDiscovery,
  referenceDiscoveryInputSchema,
} from "@/server/services/reference-discovery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input: ReturnType<typeof referenceDiscoveryInputSchema.parse>;
  try {
    input = referenceDiscoveryInputSchema.parse(await request.json());
  } catch (error) {
    return apiError(error, "references.discover_failed");
  }

  try {
    return NextResponse.json(await discoverReferenceCandidates(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    logger.warn("references.discover_fallback", { message });
    return NextResponse.json(
      fallbackReferenceDiscovery(
        input,
        "A pesquisa de referências não respondeu. Exibimos formatos demonstrativos para você seguir com o briefing.",
      ),
    );
  }
}
