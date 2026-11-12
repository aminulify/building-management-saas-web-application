import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { exitStateSchema, setExitState } from "@/modules/admin/previous-owners/service";

export const PATCH = route<{ id: string }>(async (req, { params }) => setExitState(await requireActor(req), idParam((await params).id), await parseBody(req, exitStateSchema), req));
