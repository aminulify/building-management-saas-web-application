import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { idParam } from "@/lib/api/common";
import { reject } from "@/modules/billing/upgrade.service";
import { rejectSchema } from "@/modules/billing/upgrade-schema";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "upgrade:review");
  return reject(actor, idParam((await params).id), (await parseBody(req, rejectSchema)).reason, req);
});
