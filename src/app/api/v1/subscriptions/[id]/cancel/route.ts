import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { cancelSubscription } from "@/modules/billing/extras.service";

export const POST = route<{ id: string }>(async (req, { params }) => cancelSubscription(await requireActor(req), idParam((await params).id), req));
