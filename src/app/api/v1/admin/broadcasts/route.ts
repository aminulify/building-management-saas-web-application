import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { broadcastSchema, listBroadcasts, sendBroadcast } from "@/modules/admin/broadcast-payments.service";

export const GET = route(async (req) => listBroadcasts(await requireActor(req)));

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  await authorize(actor, "broadcast:send");
  return NextResponse.json({ data: await sendBroadcast(actor, await parseBody(req, broadcastSchema), req) }, { status: 201 });
});
