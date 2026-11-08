import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listConversations, openConversation } from "@/modules/messaging/service";
import { openConversationSchema } from "@/modules/messaging/schema";

export const GET = route(async (req) => listConversations(await requireActor(req)));

/** Checks canCommunicate (role matrix + active agreement) before opening. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await openConversation(actor, await parseBody(req, openConversationSchema)) }, { status: 201 });
});
