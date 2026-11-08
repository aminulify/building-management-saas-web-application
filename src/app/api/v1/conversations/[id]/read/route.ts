import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { markRead } from "@/modules/messaging/service";

export const POST = route<{ id: string }>(async (req, { params }) => markRead(await requireActor(req), idParam((await params).id)));
