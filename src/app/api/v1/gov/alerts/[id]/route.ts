import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getAlert } from "@/modules/emergency/response.service";

export const GET = route<{ id: string }>(async (req, { params }) => getAlert(await requireActor(req), idParam((await params).id)));
