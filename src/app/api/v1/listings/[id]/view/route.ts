import { route } from "@/lib/api/handler";
import { idParam } from "@/lib/api/common";
import { clientIp } from "@/lib/rate-limit";
import { recordView } from "@/modules/marketplace/search.service";

export const POST = route<{ id: string }>(async (req, { params }) => recordView(idParam((await params).id), clientIp(req)));
