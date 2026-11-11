import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { adminAddImage, adminImageSchema } from "@/modules/admin/properties/service";

/** Attach a photo (already uploaded to private storage by the Super Admin) to a property. */
export const POST = route<{ id: string }>(async (req, { params }) => NextResponse.json({ data: await adminAddImage(await requireActor(req), idParam((await params).id), await parseBody(req, adminImageSchema)) }, { status: 201 }));
