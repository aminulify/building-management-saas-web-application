import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { receipt } from "@/modules/rent/service";

export const GET = route<{ id: string }>(async (req, { params }) => receipt(await requireActor(req), idParam((await params).id)));
