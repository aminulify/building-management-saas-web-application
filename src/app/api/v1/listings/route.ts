import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { createListing } from "@/modules/marketplace/listings.service";
import { search } from "@/modules/marketplace/search.service";
import { listingCreateSchema, searchQuery } from "@/modules/marketplace/schema";

/** Public: zone/amenity/price filtered search for rental and buy/sell listings. */
export const GET = route(async (req) => search(parseQuery(req, searchQuery)));

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await createListing(actor, await parseBody(req, listingCreateSchema), req) }, { status: 201 });
});
