import { NextResponse } from "next/server";
import { z } from "zod";
import { route, parseQuery, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { directoryQuery, listProperties } from "@/modules/directory/service";
import { adminCreateProperty, adminCreatePropertySchema } from "@/modules/admin/properties/service";

const q = directoryQuery.extend({ verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]).optional() });

export const GET = route(async (req) => listProperties(await requireActor(req), parseQuery(req, q), parseQuery(req, pageQuery)));

/** "+ Add New Property" (Super Admin, for an owner). */
export const POST = route(async (req) => NextResponse.json({ data: await adminCreateProperty(await requireActor(req), await parseBody(req, adminCreatePropertySchema), req) }, { status: 201 }));
