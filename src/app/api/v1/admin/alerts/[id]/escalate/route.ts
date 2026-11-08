import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { escalate } from "@/modules/emergency/response.service";

export const POST = route<{ id: string }>(async (req, { params }) => escalate(await requireActor(req), idParam((await params).id), req));
