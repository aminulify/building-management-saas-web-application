import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { addSavedSearch, listSavedSearches } from "@/modules/marketplace/social.service";
import { savedSearchSchema } from "@/modules/marketplace/schema";

export const GET = route(async (req) => listSavedSearches(await requireActor(req)));

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await addSavedSearch(actor, await parseBody(req, savedSearchSchema)) }, { status: 201 });
});
