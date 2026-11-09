import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { idParam } from "@/lib/api/common";
import { getGovPermissions, permissionsSchema, setGovPermissions } from "@/modules/admin/broadcast-payments.service";

/** Grant/revoke permission overrides for a Gov Admin (e.g. listing:create). */
export const GET = route<{ id: string }>(async (req, { params }) => getGovPermissions(await requireActor(req), idParam((await params).id)));

export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "govadmin:manage");
  return setGovPermissions(actor, idParam((await params).id), await parseBody(req, permissionsSchema), req);
});
