import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { govSummary } from "@/modules/gov/properties.service";

/** Government Admin: small numbers for the sidebar (open emergency alerts). */
export const GET = route(async (req) => govSummary(await requireActor(req)));
