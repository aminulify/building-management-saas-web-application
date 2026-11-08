import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { refund, refundSchema } from "@/modules/admin/broadcast-payments.service";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return refund(actor, idParam((await params).id), await parseBody(req, refundSchema), req);
});
