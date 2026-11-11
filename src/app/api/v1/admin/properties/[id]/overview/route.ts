import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { adminPropertyOverview } from "@/modules/admin/properties/service";

export const GET = route<{ id: string }>(async (req, { params }) => adminPropertyOverview(await requireActor(req), idParam((await params).id)));
