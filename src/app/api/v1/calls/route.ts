import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { startCall } from "@/modules/messaging/live-calls.service";
import { startCallSchema } from "@/modules/messaging/schema";

/** Start a live voice call inside a conversation. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await startCall(actor, (await parseBody(req, startCallSchema)).conversationId) }, { status: 201 });
});
