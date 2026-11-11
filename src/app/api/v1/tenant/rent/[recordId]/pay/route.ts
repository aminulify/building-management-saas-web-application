import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { reportPayment, tenantPaySchema } from "@/modules/rent/tenant-pay.service";

/** Tenant tells the owner a rent payment was made (bKash / Nagad / Rocket / bank). The owner verifies it. */
export const POST = route<{ recordId: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await reportPayment(actor, idParam((await params).recordId), await parseBody(req, tenantPaySchema), req) }, { status: 201 });
});
