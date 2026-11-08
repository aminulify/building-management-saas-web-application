import { route } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { isCronRequest } from "@/lib/api/common";
import { runLifecycle } from "@/modules/billing/subscription.service";

export const POST = route(async (req) => {
  if (!isCronRequest(req, env().CRON_SECRET)) throw new AppError("FORBIDDEN");
  return runLifecycle();
});
