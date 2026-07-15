import { NextResponse } from "next/server";

import { apiError } from "@/server/api/response";
import { getEnv } from "@/server/env";
import { VideoProviderError } from "@/server/providers/video";
import { processHeyGenWebhook } from "@/server/services/video-jobs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const env = getEnv();
    if (env.HEYGEN_WEBHOOK_SETUP_MODE && !env.HEYGEN_WEBHOOK_SECRET) {
      // HeyGen returns the signing secret only after endpoint creation. This
      // temporary acknowledgement lets the dashboard test reachability without
      // accepting or processing an unsigned event.
      return NextResponse.json({ received: false, setup: true }, { status: 202 });
    }
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const event = await processHeyGenWebhook(request.headers, rawBody);
    return NextResponse.json({ received: true, eventId: event.eventId });
  } catch (error) {
    if (error instanceof VideoProviderError && error.code.startsWith("webhook_")) {
      return NextResponse.json({ error: "Webhook não autenticado." }, { status: 401 });
    }
    return apiError(error, "heygen.webhook_rejected");
  }
}
