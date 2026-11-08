import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam, pageQuery } from "@/lib/api/common";
import { createUnit, listUnits } from "@/modules/properties/units.service";
import { unitCreateSchema, unitListQuery } from "@/modules/properties/schema";

export const GET = route<{ id: string }>(async (req, { params }) =>
  listUnits(await requireActor(req), idParam((await params).id), parseQuery(req, unitListQuery), parseQuery(req, pageQuery)),
);

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const unit = await createUnit(actor, idParam((await params).id), await parseBody(req, unitCreateSchema), req);
  return NextResponse.json({ data: unit }, { status: 201 });
});
