import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { myListings } from "@/modules/marketplace/listings.service";
import { myListingsQuery } from "@/modules/marketplace/schema";

export const GET = route(async (req) => myListings(await requireActor(req), parseQuery(req, myListingsQuery), parseQuery(req, pageQuery)));
