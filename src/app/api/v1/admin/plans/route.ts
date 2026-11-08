import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { createPlan, listAllPlans } from "@/modules/billing/plans.service";
import { planCreateSchema } from "@/modules/billing/schema";

export const GET = route(async (req) => {
  const actor = await requireActor(req);
  await authorize(actor, "plan:manage");
  return listAllPlans();
});

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  await authorize(actor, "plan:manage");
  return createPlan(actor, await parseBody(req, planCreateSchema), req);
});
