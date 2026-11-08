import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { findPeople, peopleSearchQuery } from "@/modules/directory/service";

/** Find People by NID, phone, email or account id (rate-limited, audited, NID masked). */
export const GET = route(async (req) => findPeople(await requireActor(req), parseQuery(req, peopleSearchQuery), req));
