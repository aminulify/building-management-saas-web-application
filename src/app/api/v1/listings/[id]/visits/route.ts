import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { requestVisit } from "@/modules/marketplace/visits.service";
import { visitCreateSchema } from "@/modules/marketplace/schema";

/** "Schedule Visit": ask the seller to show the home at a chosen date and time. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const v = await requestVisit(actor, idParam((await params).id), await parseBody(req, visitCreateSchema), req);
  return NextResponse.json({ data: v }, { status: 201 });
});
