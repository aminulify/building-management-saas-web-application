import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { createComplaint, listComplaints } from "@/modules/complaints/service";
import { complaintCreateSchema, complaintListQuery } from "@/modules/complaints/schema";

export const GET = route(async (req) =>
  listComplaints(await requireActor(req), parseQuery(req, complaintListQuery), parseQuery(req, pageQuery)),
);

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await createComplaint(actor, await parseBody(req, complaintCreateSchema), req) }, { status: 201 });
});
