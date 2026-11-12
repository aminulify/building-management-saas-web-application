import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { ownerStatusSchema, setOwnerStatus } from "@/modules/admin/owners/service";

export const PATCH = route<{ id: string }>(async (req, { params }) => setOwnerStatus(await requireActor(req), idParam((await params).id), await parseBody(req, ownerStatusSchema), req));
