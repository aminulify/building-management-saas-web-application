import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { setPropertyState, setStateSchema } from "@/modules/admin/properties/service";

/** PATCH { status: "ACTIVE" | "PENDING" } */
export const PATCH = route<{ id: string }>(async (req, { params }) => setPropertyState(await requireActor(req), idParam((await params).id), await parseBody(req, setStateSchema), req));
