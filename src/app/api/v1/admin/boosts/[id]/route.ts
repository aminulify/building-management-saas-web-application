import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { boostEditSchema } from "@/modules/boost/rules";
import { deleteBoost, editBoost } from "@/modules/boost/admin.service";

/** Super Admin: edit a boost (state / days) or delete it. */
export const PATCH = route<{ id: string }>(async (req, { params }) => editBoost(await requireActor(req), idParam((await params).id), await parseBody(req, boostEditSchema), req));
export const DELETE = route<{ id: string }>(async (req, { params }) => deleteBoost(await requireActor(req), idParam((await params).id), req));
