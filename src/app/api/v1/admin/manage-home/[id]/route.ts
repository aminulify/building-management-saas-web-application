import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { archiveHomeListing } from "@/modules/admin/manage-home/service";

/** Delete & Archive: the listing moves to Previous Properties. */
export const DELETE = route<{ id: string }>(async (req, { params }) => archiveHomeListing(await requireActor(req), idParam((await params).id), req));
