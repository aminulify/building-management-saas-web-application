import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { archiveDelete, archiveDetails } from "@/modules/admin/previous-owners/service";

export const GET = route<{ id: string }>(async (req, { params }) => archiveDetails(await requireActor(req), idParam((await params).id)));
/** Delete: erased when nothing depends on the owner, otherwise kept as a hidden Deleted record. */
export const DELETE = route<{ id: string }>(async (req, { params }) => archiveDelete(await requireActor(req), idParam((await params).id), req));
