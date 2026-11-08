import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listCallRequests, requestCall } from "@/modules/messaging/calls.service";
import { callRequestListQuery, callRequestSchema } from "@/modules/messaging/schema";

export const GET = route(async (req) => listCallRequests(await requireActor(req), parseQuery(req, callRequestListQuery).status));

/** "Call later": schedule a callback with the other person in a conversation. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await requestCall(actor, await parseBody(req, callRequestSchema)) }, { status: 201 });
});
