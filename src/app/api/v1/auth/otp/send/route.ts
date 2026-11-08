import { route, parseBody } from "@/lib/api/handler";
import { sendOtp } from "@/modules/auth/service";
import { otpSendSchema } from "@/modules/auth/schema";

export const POST = route(async (req) => sendOtp((await parseBody(req, otpSendSchema)).identifier, req));
