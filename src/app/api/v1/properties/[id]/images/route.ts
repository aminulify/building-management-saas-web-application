import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { addImage } from "@/modules/properties/service";
import { imageSchema } from "@/modules/properties/schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const img = await addImage(actor, idParam((await params).id), await parseBody(req, imageSchema));
  return NextResponse.json({ data: img }, { status: 201 });
});
