import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { acceptSolved } from "@/modules/emergency/sos.service";

/** "Accept & Close Issue": the reporter confirms a SOLVED alert. */
export const POST = route<{ id: string }>(async (req, { params }) => acceptSolved(await requireActor(req), idParam((await params).id), req));
