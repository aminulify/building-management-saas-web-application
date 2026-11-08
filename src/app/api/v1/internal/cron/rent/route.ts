import { route, parseBody } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { isCronRequest } from "@/lib/api/common";
import { generateMonthlyRecords } from "@/modules/rent/service";
import { monthStart } from "@/modules/rent/billing";
import { cronRentSchema } from "@/modules/rent/schema";

/** Scheduler (Vercel Cron / worker) → POST with header x-cron-secret. Idempotent. */
export const POST = route(async (req) => {
  if (!isCronRequest(req, env().CRON_SECRET)) throw new AppError("FORBIDDEN");
  const body = await parseBody(req, cronRentSchema).catch(() => ({ month: undefined }));
  return generateMonthlyRecords(body.month ? monthStart(body.month) : monthStart());
});
