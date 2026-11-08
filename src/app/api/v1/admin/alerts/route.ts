import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { adminOverview } from "@/modules/emergency/response.service";

export const GET = route(async (req) => adminOverview(await requireActor(req)));
