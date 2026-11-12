import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { editTenant, tenantDetails, tenantEditSchema } from "@/modules/admin/tenants/service";

export const GET = route<{ id: string }>(async (req, { params }) => tenantDetails(await requireActor(req), idParam((await params).id)));
export const PATCH = route<{ id: string }>(async (req, { params }) => editTenant(await requireActor(req), idParam((await params).id), await parseBody(req, tenantEditSchema), req));
