import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { tenantInvoice } from "@/modules/rent/history.service";

/** Data of the PDF invoice for a fully paid month (the PDF itself is drawn in the browser). */
export const GET = route<{ recordId: string }>(async (req, { params }) => tenantInvoice(await requireActor(req), idParam((await params).recordId)));
