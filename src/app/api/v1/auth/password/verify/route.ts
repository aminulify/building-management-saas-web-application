import { route, parseBody } from "@/lib/api/handler";
import { verifyRecoveryCode } from "@/modules/auth/service";
import { recoveryVerifySchema } from "@/modules/auth/schema";

export const POST = route(async (req) => {
  const { email, token } = await parseBody(req, recoveryVerifySchema);
  return verifyRecoveryCode(email, token, req);
});
