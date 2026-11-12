import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { listingFull } from "@/modules/admin/find-people/service";

/** Full details for the Find People windows (opened by clicking an item inside a profile). Super Admin only. */
export const GET = route<{ lid: string }>(async (req, { params }) => listingFull(await requireActor(req), idParam((await params).lid)));
