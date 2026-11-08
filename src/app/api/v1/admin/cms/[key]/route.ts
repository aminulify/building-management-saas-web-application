import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { cmsPutSchema, putCms } from "@/modules/public/service";

export const PUT = route<{ key: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "settings:manage");
  return putCms(actor, (await params).key, await parseBody(req, cmsPutSchema), req);
});
