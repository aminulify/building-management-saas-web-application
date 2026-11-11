import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getForReview } from "@/modules/directory/property-review.service";
import { deleteProperty } from "@/modules/admin/properties/service";

/** Property verification screen: details + documents with short-lived signed URLs. */
export const GET = route<{ id: string }>(async (req, { params }) => getForReview(await requireActor(req), idParam((await params).id)));

/** Delete from the Super Admin Properties page: a soft delete, refused while a tenant lives there. */
export const DELETE = route<{ id: string }>(async (req, { params }) => deleteProperty(await requireActor(req), idParam((await params).id), req));
