import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { addListingDocument } from "@/modules/marketplace/listings.service";
import { listingDocSchema } from "@/modules/marketplace/schema";

/** Ownership / additional documents (private; only moderators see them). */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await addListingDocument(actor, idParam((await params).id), await parseBody(req, listingDocSchema)) }, { status: 201 });
});
