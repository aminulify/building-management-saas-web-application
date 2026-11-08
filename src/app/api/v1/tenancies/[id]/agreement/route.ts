import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { agreementSchema, agreementUrl, attachAgreement } from "@/modules/tenancy/agreement.service";

/** Signed 5-minute download link for the agreement (owner, tenant, Super Admin). */
export const GET = route<{ id: string }>(async (req, { params }) => agreementUrl(await requireActor(req), idParam((await params).id)));

/** Owner attaches the uploaded agreement file. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return attachAgreement(actor, idParam((await params).id), (await parseBody(req, agreementSchema)).storageKey, req);
});
