import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { myFavorites } from "@/modules/marketplace/social.service";

export const GET = route(async (req) => myFavorites(await requireActor(req)));
