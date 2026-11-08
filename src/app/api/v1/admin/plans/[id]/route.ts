import { z } from "zod";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { updatePlan } from "@/modules/billing/plans.service";
import { deletePlan } from "@/modules/billing/extras.service";
import { planUpdateSchema } from "@/modules/billing/schema";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "pricing:manage");
  const { id } = await params;
  return updatePlan(actor, z.string().uuid().parse(id), await parseBody(req, planUpdateSchema), req);
});

/** Only plans that were never subscribed to can be deleted; otherwise deactivate. */
export const DELETE = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "plan:manage");
  return deletePlan(actor, z.string().uuid().parse((await params).id), req);
});
