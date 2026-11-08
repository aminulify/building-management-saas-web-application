import { route, parseBody } from "@/lib/api/handler";
import { login } from "@/modules/auth/service";
import { loginSchema } from "@/modules/auth/schema";

export const POST = route(async (req) => login(await parseBody(req, loginSchema), req));
