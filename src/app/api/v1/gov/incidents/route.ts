import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { createIncident, listIncidents } from "@/modules/emergency/response.service";
import { incidentCreateSchema } from "@/modules/emergency/schema";

export const GET = route(async (req) => listIncidents(await requireActor(req)));

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await createIncident(actor, await parseBody(req, incidentCreateSchema), req) }, { status: 201 });
});
