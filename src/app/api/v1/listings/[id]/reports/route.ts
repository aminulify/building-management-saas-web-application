import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { reportListing } from "@/modules/marketplace/social.service";
import { reportSchema } from "@/modules/marketplace/schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await reportListing(actor, idParam((await params).id), await parseBody(req, reportSchema)) }, { status: 201 });
});
