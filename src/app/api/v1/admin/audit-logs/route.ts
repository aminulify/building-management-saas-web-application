import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { auditQuery, listAudit } from "@/modules/admin/audit.service";

/** Super Admin: all entries. Gov Admin: only their own actions. */
export const GET = route(async (req) => listAudit(await requireActor(req), parseQuery(req, auditQuery), parseQuery(req, pageQuery)));
