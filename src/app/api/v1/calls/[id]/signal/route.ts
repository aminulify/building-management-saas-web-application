import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { relaySignal } from "@/modules/messaging/live-calls.service";
import { callSignalSchema } from "@/modules/messaging/schema";

/** Relay a WebRTC offer / answer / ICE candidate to the other person on the call. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return relaySignal(actor, idParam((await params).id), await parseBody(req, callSignalSchema));
});
