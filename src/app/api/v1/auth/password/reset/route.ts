import { route, parseBody } from "@/lib/api/handler";
import { bearerToken } from "@/lib/auth/bearer";
import { resetPassword } from "@/modules/auth/service";
import { resetSchema } from "@/modules/auth/schema";

export const POST = route(async (req) => resetPassword(bearerToken(req), (await parseBody(req, resetSchema)).password));
