import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { tenantRecords } from "@/modules/rent/service";

export const GET = route(async (req) => tenantRecords(await requireActor(req)));
