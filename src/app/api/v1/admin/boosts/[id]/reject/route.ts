import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { boostRejectSchema } from "@/modules/boost/rules";
import { rejectBoost } from "@/modules/boost/admin.service";

export const POST = route<{ id: string }>(async (req, { params }) => rejectBoost(await requireActor(req), idParam((await params).id), (await parseBody(req, boostRejectSchema)).reason, req));
