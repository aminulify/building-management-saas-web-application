import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { inviteTenant } from "@/modules/tenancy/service";
import { inviteSchema } from "@/modules/tenancy/schema";

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await inviteTenant(actor, await parseBody(req, inviteSchema), req) }, { status: 201 });
});
