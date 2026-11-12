import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { ownerListingShort } from "@/modules/admin/owners/service";

export const GET = route<{ id: string; lid: string }>(async (req, { params }) => { const p = await params; return ownerListingShort(await requireActor(req), idParam(p.id), idParam(p.lid)); });
