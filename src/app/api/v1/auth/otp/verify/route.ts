import { route, parseBody } from "@/lib/api/handler";
import { verifyOtp } from "@/modules/auth/service";
import { otpVerifySchema } from "@/modules/auth/schema";

export const POST = route(async (req) => {
  const { identifier, token } = await parseBody(req, otpVerifySchema);
  return verifyOtp(identifier, token);
});
