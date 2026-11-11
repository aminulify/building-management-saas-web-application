import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantOverview } from "@/modules/users/tenant-overview.service";

/** Tenant Free / Tenant Profile page: identity, Tenant ID, address and document states in one call. */
export const GET = route(async (req) => tenantOverview(await requireActor(req)));
