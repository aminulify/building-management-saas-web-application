import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { freeList, freeListQuery } from "@/modules/admin/tenant-free/service";

/** Super Admin: Tenant-Free accounts (people who are not an owner or a tenant yet): NID tab, search, page number. */
export const GET = route(async (req) => freeList(await requireActor(req), parseQuery(req, freeListQuery)));
