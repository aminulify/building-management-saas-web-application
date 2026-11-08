import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { createRequest, listRequests } from "@/modules/maintenance/service";
import { maintenanceCreateSchema, maintenanceListQuery } from "@/modules/maintenance/schema";

export const GET = route(async (req) =>
  listRequests(await requireActor(req), parseQuery(req, maintenanceListQuery), parseQuery(req, pageQuery)),
);

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await createRequest(actor, await parseBody(req, maintenanceCreateSchema), req) }, { status: 201 });
});
