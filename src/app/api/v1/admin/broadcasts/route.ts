import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { broadcastSchema, listBroadcasts, sendBroadcast } from "@/modules/admin/broadcast-payments.service";

export const GET = route(async (req) => listBroadcasts(await requireActor(req)));

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await sendBroadcast(actor, await parseBody(req, broadcastSchema), req) }, { status: 201 });
});
