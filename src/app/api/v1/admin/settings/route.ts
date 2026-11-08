import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { getSettings, patchSettings, settingsPatchSchema } from "@/modules/admin/settings.service";

/** Secrets are returned masked; they can only be replaced, never read back. */
export const GET = route(async (req) => {
  await authorize(await requireActor(req), "settings:manage");
  return getSettings();
});

export const PATCH = route(async (req) => {
  const actor = await requireActor(req);
  await authorize(actor, "settings:manage");
  return patchSettings(actor, await parseBody(req, settingsPatchSchema), req);
});
