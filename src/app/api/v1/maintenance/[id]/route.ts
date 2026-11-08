import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getRequest } from "@/modules/maintenance/service";

export const GET = route<{ id: string }>(async (req, { params }) => getRequest(await requireActor(req), idParam((await params).id)));
