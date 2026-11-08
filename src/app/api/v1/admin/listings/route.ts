import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { adminList } from "@/modules/marketplace/moderation.service";
import { adminListingsQuery } from "@/modules/marketplace/schema";

export const GET = route(async (req) => adminList(await requireActor(req), parseQuery(req, adminListingsQuery), parseQuery(req, pageQuery)));
