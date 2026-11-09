import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { idParam } from "@/lib/api/common";
import { listScheduled, scheduleSchema, schedulePlanChange } from "@/modules/billing/extras.service";

export const GET = route<{ id: string }>(async (req, { params }) => listScheduled(await requireActor(req), idParam((await params).id)));

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "pricing:manage");
  return NextResponse.json({ data: await schedulePlanChange(actor, idParam((await params).id), await parseBody(req, scheduleSchema), req) }, { status: 201 });
});
