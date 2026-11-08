import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { changePassword, changePasswordSchema } from "@/modules/users/profile.service";

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return changePassword(actor, await parseBody(req, changePasswordSchema), req);
});
