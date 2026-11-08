import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { myAlerts } from "@/modules/emergency/sos.service";

export const GET = route(async (req) => {
  const actor = await requireActor(req);
  await authorize(actor, "sos:create");
  return myAlerts(actor);
});
