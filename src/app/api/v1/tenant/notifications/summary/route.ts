import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantSummary } from "@/modules/notifications/tenant-center.service";

/** The three cards of "Your Activity": next payment, pending tasks, quick issues. */
export const GET = route(async (req) => tenantSummary(await requireActor(req)));
