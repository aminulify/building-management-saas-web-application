import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { raiseSos } from "@/modules/emergency/sos.service";
import { sosCreateSchema } from "@/modules/emergency/schema";

/** Owner or Tenant raises an SOS; it is routed straight to the Government Admin hub. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const out = await raiseSos(actor, await parseBody(req, sosCreateSchema), req);
  return NextResponse.json({ data: out }, { status: out.deduped ? 200 : 201 });
});
