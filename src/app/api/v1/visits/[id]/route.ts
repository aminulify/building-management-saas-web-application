import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { cancelVisit, respondVisit } from "@/modules/marketplace/visits.service";
import { visitRespondSchema } from "@/modules/marketplace/schema";

/** Seller: confirm or decline a pending request. */
export const PATCH = route<{ id: string }>(async (req, { params }) => respondVisit(await requireActor(req), idParam((await params).id), await parseBody(req, visitRespondSchema), req));

/** Seeker: withdraw a pending or confirmed request. */
export const DELETE = route<{ id: string }>(async (req, { params }) => cancelVisit(await requireActor(req), idParam((await params).id), req));
