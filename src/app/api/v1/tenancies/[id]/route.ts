import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getTenancy, updateTenancy } from "@/modules/tenancy/service";
import { tenancyUpdateSchema } from "@/modules/tenancy/schema";

export const GET = route<{ id: string }>(async (req, { params }) => getTenancy(await requireActor(req), idParam((await params).id)));

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return updateTenancy(actor, idParam((await params).id), await parseBody(req, tenancyUpdateSchema), req);
});
