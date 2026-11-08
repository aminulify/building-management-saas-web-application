import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { endTenancy } from "@/modules/tenancy/service";
import { endTenancySchema } from "@/modules/tenancy/schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return endTenancy(actor, idParam((await params).id), await parseBody(req, endTenancySchema), req);
});
