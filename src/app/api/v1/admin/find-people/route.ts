import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { findPeople, findQuery } from "@/modules/admin/find-people/service";

/** Super Admin: one search box for NID, e-mail, phone, account ID or username (exact matches, rate limited, audited). */
export const GET = route(async (req) => findPeople(await requireActor(req), parseQuery(req, findQuery), req));
