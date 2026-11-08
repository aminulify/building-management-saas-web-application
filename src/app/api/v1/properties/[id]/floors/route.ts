import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { listFloors } from "@/modules/properties/units.service";

export const GET = route<{ id: string }>(async (req, { params }) =>
  listFloors(await requireActor(req), idParam((await params).id)),
);
