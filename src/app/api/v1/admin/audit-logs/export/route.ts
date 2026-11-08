import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { csvResponse } from "@/lib/csv";
import { auditQuery, exportAudit } from "@/modules/admin/audit.service";

export const GET = route(async (req) => csvResponse("audit-logs.csv", await exportAudit(await requireActor(req), parseQuery(req, auditQuery), req)));
