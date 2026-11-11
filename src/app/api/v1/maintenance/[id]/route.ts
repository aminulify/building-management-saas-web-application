import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { maintenanceUpdateSchema } from "@/modules/maintenance/schema";
import { deleteRequest, getRequest, updateRequest } from "@/modules/maintenance/service";

export const GET = route<{ id: string }>(async (req, { params }) => getRequest(await requireActor(req), idParam((await params).id)));

/** The tenant edits their own request (Edit Issue window); the owner is notified. */
export const PATCH = route<{ id: string }>(async (req, { params }) => updateRequest(await requireActor(req), idParam((await params).id), await parseBody(req, maintenanceUpdateSchema), req));

/** A request is removed (photos and comments included): by the owner, or by the tenant who made it; the other side is notified. */
export const DELETE = route<{ id: string }>(async (req, { params }) => deleteRequest(await requireActor(req), idParam((await params).id), req));
