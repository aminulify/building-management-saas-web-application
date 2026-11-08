import { z } from "zod";
import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { setPlanActive } from "@/modules/billing/plans.service";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "plan:manage");
  return setPlanActive(actor, z.string().uuid().parse((await params).id), true, req);
});
