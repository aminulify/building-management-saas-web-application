import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { getInvoice } from "@/modules/billing/extras.service";

/** Invoice data (the PDF renderer consumes this). Owner of the payment or Super Admin. */
export const GET = route<{ id: string }>(async (req, { params }) => getInvoice(await requireActor(req), idParam((await params).id)));
