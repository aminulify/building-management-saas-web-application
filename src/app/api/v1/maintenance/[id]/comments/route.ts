import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { addComment } from "@/modules/maintenance/service";
import { commentSchema } from "@/modules/maintenance/schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  const c = await addComment(actor, idParam((await params).id), (await parseBody(req, commentSchema)).body);
  return NextResponse.json({ data: c }, { status: 201 });
});
