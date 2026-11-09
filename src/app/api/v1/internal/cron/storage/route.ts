import { route } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { isCronRequest } from "@/lib/api/common";
import { purgeStaleRegistrationUploads } from "@/modules/auth/registration-uploads";

/** Daily: removes abandoned sign-up uploads (private ID photos must not linger). Header: x-cron-secret. */
export const POST = route(async (req) => {
  if (!isCronRequest(req, env().CRON_SECRET)) throw new AppError("FORBIDDEN");
  return purgeStaleRegistrationUploads();
});
