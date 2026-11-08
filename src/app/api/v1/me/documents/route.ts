import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { addMyDocument, documentSchema, myDocuments } from "@/modules/uploads/documents.service";

export const GET = route(async (req) => myDocuments(await requireActor(req)));

/** Register an uploaded NID front/back (or other) document for verification. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await addMyDocument(actor, await parseBody(req, documentSchema), req) }, { status: 201 });
});
