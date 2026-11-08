import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { listMessages, sendMessage } from "@/modules/messaging/service";
import { messagesQuery, sendMessageSchema } from "@/modules/messaging/schema";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const q = parseQuery(req, messagesQuery);
  return listMessages(actor, idParam((await params).id), q.before, q.q);
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const msg = await sendMessage(actor, idParam((await params).id), await parseBody(req, sendMessageSchema));
  return NextResponse.json({ data: msg }, { status: 201 });
});
