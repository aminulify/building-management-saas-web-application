import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { getProfile, profileUpdateSchema, updateProfile } from "@/modules/users/profile.service";

export const GET = route(async (req) => getProfile(await requireActor(req)));

export const PATCH = route(async (req) => {
  const actor = await requireActor(req);
  return updateProfile(actor, await parseBody(req, profileUpdateSchema), req);
});
