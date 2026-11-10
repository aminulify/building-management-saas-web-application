import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { remindAll } from "@/modules/rent/ledger.service";
import { remindAllSchema } from "@/modules/rent/schema";

/** "Send Reminder": in-app + SMS reminders to every tenant whose unpaid rent is past its due date. */
export const POST = route(async (req) => remindAll(await requireActor(req), await parseBody(req, remindAllSchema), req));
