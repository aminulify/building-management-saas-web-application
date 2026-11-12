import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { approveBoost } from "@/modules/boost/admin.service";

export const POST = route<{ id: string }>(async (req, { params }) => approveBoost(await requireActor(req), idParam((await params).id), req));
