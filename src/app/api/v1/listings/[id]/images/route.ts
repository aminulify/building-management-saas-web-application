import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { addListingImage } from "@/modules/marketplace/listings.service";
import { imageSchema } from "@/modules/marketplace/schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await addListingImage(actor, idParam((await params).id), await parseBody(req, imageSchema)) }, { status: 201 });
});
