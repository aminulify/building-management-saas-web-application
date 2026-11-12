import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { archiveDelete, archiveDetails, recordSchema, setRecord } from "@/modules/admin/previous-tenants/service";

export const GET = route<{ id: string }>(async (req, { params }) => archiveDetails(await requireActor(req), idParam((await params).id)));
/** Edit rent status and reason for leaving. */
export const PATCH = route<{ id: string }>(async (req, { params }) => setRecord(await requireActor(req), idParam((await params).id), await parseBody(req, recordSchema), req));
/** Delete: erased when nothing depends on the tenancy, otherwise kept as a hidden record. */
export const DELETE = route<{ id: string }>(async (req, { params }) => archiveDelete(await requireActor(req), idParam((await params).id), req));
