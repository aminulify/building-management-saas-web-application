import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { freeStatusSchema, setFreeStatus } from "@/modules/admin/tenant-free/service";

export const PATCH = route<{ id: string }>(async (req, { params }) => setFreeStatus(await requireActor(req), idParam((await params).id), await parseBody(req, freeStatusSchema), req));
