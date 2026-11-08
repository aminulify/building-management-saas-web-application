import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getProperty, updateProperty } from "@/modules/properties/service";
import { propertyUpdateSchema } from "@/modules/properties/schema";

export const GET = route<{ id: string }>(async (req, { params }) =>
  getProperty(await requireActor(req), idParam((await params).id)),
);

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return updateProperty(actor, idParam((await params).id), await parseBody(req, propertyUpdateSchema), req);
});
