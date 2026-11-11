import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { historyRecordsQuery, tenantHistoryRecords } from "@/modules/rent/history.service";

/** More rent rows of one stay ("View All Receipts"). */
export const GET = route<{ agreementId: string }>(async (req, { params }) =>
  tenantHistoryRecords(await requireActor(req), idParam((await params).agreementId), parseQuery(req, historyRecordsQuery)));
