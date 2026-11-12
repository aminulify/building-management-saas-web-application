import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { ownerPropertyShort } from "@/modules/admin/owners/service";

export const GET = route<{ id: string; pid: string }>(async (req, { params }) => { const p = await params; return ownerPropertyShort(await requireActor(req), idParam(p.id), idParam(p.pid)); });
