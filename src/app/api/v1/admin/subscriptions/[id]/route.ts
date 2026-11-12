import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { subscriptionDetails } from "@/modules/admin/subscriptions/service";

export const GET = route<{ id: string }>(async (req, { params }) => subscriptionDetails(await requireActor(req), idParam((await params).id)));
