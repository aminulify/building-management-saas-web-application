import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getForReview } from "@/modules/directory/property-review.service";

/** Property verification screen: details + documents with short-lived signed URLs. */
export const GET = route<{ id: string }>(async (req, { params }) => getForReview(await requireActor(req), idParam((await params).id)));
