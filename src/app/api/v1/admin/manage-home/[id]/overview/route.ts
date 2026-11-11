import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { homeOverview } from "@/modules/admin/manage-home/service";

export const GET = route<{ id: string }>(async (req, { params }) => homeOverview(await requireActor(req), idParam((await params).id)));
