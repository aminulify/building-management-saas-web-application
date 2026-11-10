import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { assignTenant } from "@/modules/properties/units.service";
import { assignTenantSchema } from "@/modules/properties/schema";

/** Owner moves a registered tenant into this vacant unit. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const agreement = await assignTenant(actor, idParam((await params).id), await parseBody(req, assignTenantSchema), req);
  return NextResponse.json({ data: agreement }, { status: 201 });
});
