import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { deleteRequest, getRequest } from "@/modules/maintenance/service";

export const GET = route<{ id: string }>(async (req, { params }) => getRequest(await requireActor(req), idParam((await params).id)));

/** Owner removes a request (photos and comments included); the tenant is notified. */
export const DELETE = route<{ id: string }>(async (req, { params }) => deleteRequest(await requireActor(req), idParam((await params).id), req));
