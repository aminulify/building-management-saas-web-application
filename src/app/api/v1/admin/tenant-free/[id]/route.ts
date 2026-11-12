import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { freeDetails } from "@/modules/admin/tenant-free/service";

export const GET = route<{ id: string }>(async (req, { params }) => freeDetails(await requireActor(req), idParam((await params).id)));
