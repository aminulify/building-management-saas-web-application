import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { boostSettingsPatch } from "@/modules/boost/rules";
import { getBoostSettings, saveBoostSettings } from "@/modules/boost/admin.service";

export const GET = route(async (req) => getBoostSettings(await requireActor(req)));

/** PATCH { enabled?, fee?, durationDays? } */
export const PATCH = route(async (req) => saveBoostSettings(await requireActor(req), await parseBody(req, boostSettingsPatch), req));
