import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { deleteSavedSearch } from "@/modules/marketplace/social.service";

export const DELETE = route<{ id: string }>(async (req, { params }) => deleteSavedSearch(await requireActor(req), idParam((await params).id)));
