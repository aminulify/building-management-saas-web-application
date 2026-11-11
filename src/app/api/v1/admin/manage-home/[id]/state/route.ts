import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { homeStateSchema, setHomeState } from "@/modules/admin/manage-home/service";

/** PATCH { state: "ACTIVE" | "PENDING" | "REPORTED" | "REJECTED" } */
export const PATCH = route<{ id: string }>(async (req, { params }) => setHomeState(await requireActor(req), idParam((await params).id), await parseBody(req, homeStateSchema), req));
