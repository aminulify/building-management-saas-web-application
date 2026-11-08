import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { archiveConversation } from "@/modules/messaging/service";

export const POST = route<{ id: string }>(async (req, { params }) => archiveConversation(await requireActor(req), idParam((await params).id)));
