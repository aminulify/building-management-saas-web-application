import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { getPaymentInfo } from "@/modules/billing/quote.service";

/** The bKash number is read from PlatformSetting, never hard-coded. Signed-in users only. */
export const GET = route(async (req) => {
  await requireActor(req);
  return getPaymentInfo();
});
