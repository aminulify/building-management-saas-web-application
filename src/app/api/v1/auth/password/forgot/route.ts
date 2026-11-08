import { route, parseBody } from "@/lib/api/handler";
import { forgotPassword } from "@/modules/auth/service";
import { forgotSchema } from "@/modules/auth/schema";

export const POST = route(async (req) => forgotPassword((await parseBody(req, forgotSchema)).email, req));
