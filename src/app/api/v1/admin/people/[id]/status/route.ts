import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { personStatusSchema, setPersonStatus } from "@/modules/admin/people/service";

export const PATCH = route<{ id: string }>(async (req, { params }) => setPersonStatus(await requireActor(req), idParam((await params).id), await parseBody(req, personStatusSchema), req));
