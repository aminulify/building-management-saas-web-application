import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getComplaint } from "@/modules/complaints/service";

export const GET = route<{ id: string }>(async (req, { params }) => getComplaint(await requireActor(req), idParam((await params).id)));
