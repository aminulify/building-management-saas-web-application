import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { propertyFull } from "@/modules/admin/find-people/service";

/** Full details for the Find People windows (opened by clicking an item inside a profile). Super Admin only. */
export const GET = route<{ pid: string }>(async (req, { params }) => propertyFull(await requireActor(req), idParam((await params).pid)));
