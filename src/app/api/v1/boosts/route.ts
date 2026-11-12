import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { boostRequestSchema, myBoostsQuery } from "@/modules/boost/rules";
import { myBoosts, requestBoost } from "@/modules/boost/service";

/** The seller's own boost requests. */
export const GET = route(async (req) => myBoosts(await requireActor(req), parseQuery(req, myBoostsQuery).listingId));

/** Send the bKash payment details for a boost; the Super Admin verifies them. */
export const POST = route(async (req) => NextResponse.json({ data: await requestBoost(await requireActor(req), await parseBody(req, boostRequestSchema), req) }, { status: 201 }));
