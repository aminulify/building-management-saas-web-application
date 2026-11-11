import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { homeFeatureSchema, setHomeFeatured } from "@/modules/admin/manage-home/service";

/** PATCH { featured: boolean } */
export const PATCH = route<{ id: string }>(async (req, { params }) => setHomeFeatured(await requireActor(req), idParam((await params).id), await parseBody(req, homeFeatureSchema), req));
