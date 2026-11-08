import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { listReports } from "@/modules/marketplace/moderation.service";

export const GET = route<{ id: string }>(async (req, { params }) => listReports(await requireActor(req), idParam((await params).id)));
