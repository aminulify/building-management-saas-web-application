import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { archiveStatusSchema, setArchiveStatus } from "@/modules/admin/previous-properties/service";

export const PATCH = route<{ id: string }>(async (req, { params }) => setArchiveStatus(await requireActor(req), idParam((await params).id), await parseBody(req, archiveStatusSchema), req));
