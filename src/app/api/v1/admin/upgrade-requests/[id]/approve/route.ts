import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { approve } from "@/modules/billing/upgrade.service";

export const POST = route<{ id: string }>(async (req, { params }) => approve(await requireActor(req), idParam((await params).id), req));
