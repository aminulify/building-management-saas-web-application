import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { removePastRecord, updatePastRecord } from "@/modules/tenancy/past.service";
import { pastRecordSchema } from "@/modules/tenancy/schema";

export const PATCH = route<{ id: string }>(async (req, { params }) => updatePastRecord(await requireActor(req), idParam((await params).id), await parseBody(req, pastRecordSchema), req));

/** Removes the row from the Previous Tenants list; the agreement and its rent records are kept. */
export const DELETE = route<{ id: string }>(async (req, { params }) => removePastRecord(await requireActor(req), idParam((await params).id), req));
