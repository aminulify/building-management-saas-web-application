import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { maintenanceDelete, maintenanceDetails, maintenanceEdit, maintenanceEditSchema } from "@/modules/admin/maintenance/service";

export const GET = route<{ id: string }>(async (req, { params }) => maintenanceDetails(await requireActor(req), idParam((await params).id)));
export const PATCH = route<{ id: string }>(async (req, { params }) => maintenanceEdit(await requireActor(req), idParam((await params).id), await parseBody(req, maintenanceEditSchema), req));
export const DELETE = route<{ id: string }>(async (req, { params }) => maintenanceDelete(await requireActor(req), idParam((await params).id), req));
