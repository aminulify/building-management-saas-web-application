import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { addPropertyDocument, propertyDocSchema } from "@/modules/directory/property-review.service";

/** Owner attaches an ownership document; the property moves to verification PENDING. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await addPropertyDocument(actor, idParam((await params).id), await parseBody(req, propertyDocSchema)) }, { status: 201 });
});
