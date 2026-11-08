import { route } from "@/lib/api/handler";
import { bearerToken } from "@/lib/auth/bearer";
import { logout } from "@/modules/auth/service";

export const POST = route(async (req) => logout(bearerToken(req)));
