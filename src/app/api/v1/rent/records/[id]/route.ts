import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { adjustRecord, adjustSchema } from "@/modules/rent/extras.service";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return adjustRecord(actor, idParam((await params).id), (await parseBody(req, adjustSchema)).other, req);
});
