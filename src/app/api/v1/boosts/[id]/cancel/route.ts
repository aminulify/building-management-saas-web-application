import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { cancelBoost } from "@/modules/boost/service";

export const POST = route<{ id: string }>(async (req, { params }) => cancelBoost(await requireActor(req), idParam((await params).id), req));
