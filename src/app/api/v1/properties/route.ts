import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { createProperty, listProperties } from "@/modules/properties/service";
import { propertyCreateSchema, propertyListQuery } from "@/modules/properties/schema";

export const GET = route(async (req) =>
  listProperties(await requireActor(req), parseQuery(req, propertyListQuery), parseQuery(req, pageQuery)),
);

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await createProperty(actor, await parseBody(req, propertyCreateSchema), req) }, { status: 201 });
});
