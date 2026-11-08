import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { verifyPayment, verifySchema } from "@/modules/rent/extras.service";

/** Owner confirms (or rejects) a payment that was recorded as unverified. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return verifyPayment(actor, idParam((await params).id), (await parseBody(req, verifySchema)).decision, req);
});
