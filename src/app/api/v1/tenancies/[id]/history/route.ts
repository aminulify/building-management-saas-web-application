import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { pastTenantDetail } from "@/modules/tenancy/past.service";

/** Complete tenant history: profile, residency, month-by-month rent ledger and money summary. */
export const GET = route<{ id: string }>(async (req, { params }) => pastTenantDetail(await requireActor(req), idParam((await params).id)));
