import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { archiveProperty } from "@/modules/properties/service";
import { archiveSchema } from "@/modules/properties/schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return archiveProperty(actor, idParam((await params).id), (await parseBody(req, archiveSchema)).reason, req);
});
