import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { requestSignature } from "@/modules/tenancy/agreement.service";

/** Ask the tenant to review and digitally sign the uploaded agreement. */
export const POST = route<{ id: string }>(async (req, { params }) => requestSignature(await requireActor(req), idParam((await params).id), req));
