import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { z } from "zod";
import { reminderAudience, reminderPreview, reminderSchema, sendReminder } from "@/modules/admin/subscriptions/service";

/** Who a reminder would reach, and how much is due. */
export const GET = route(async (req) => reminderPreview(await requireActor(req), parseQuery(req, z.object({ audience: reminderAudience })).audience));
/** Send the reminder to the owners of the chosen group. */
export const POST = route(async (req) => NextResponse.json({ data: await sendReminder(await requireActor(req), await parseBody(req, reminderSchema), req) }, { status: 201 }));
