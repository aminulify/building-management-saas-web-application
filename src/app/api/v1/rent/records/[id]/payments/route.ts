import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { recordPayment } from "@/modules/rent/service";
import { paymentSchema } from "@/modules/rent/schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const out = await recordPayment(actor, idParam((await params).id), await parseBody(req, paymentSchema), req);
  return NextResponse.json({ data: out }, { status: 201 });
});
