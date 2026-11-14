import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { govPropertyDetails } from "@/modules/gov/properties.service";

/** Government Admin: everything about one property (owner, verification, documents, audit trail). */
export const GET = route<{ id: string }>(async (req, { params }) => govPropertyDetails(await requireActor(req), idParam((await params).id)));
