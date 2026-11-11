import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { ownerAgreements } from "@/modules/tenancy/agreement.service";

/** The owner's active tenancies with their agreement file state (Owner Profile → Agreement). */
export const GET = route(async (req) => ownerAgreements(await requireActor(req)));
