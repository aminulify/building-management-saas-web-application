import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { unreadSummary } from "@/modules/messaging/unread.service";

export const GET = route(async (req) => unreadSummary(await requireActor(req)));
