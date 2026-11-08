import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { contactSchema, submitContact } from "@/modules/public/service";

export const POST = route(async (req) => NextResponse.json({ data: await submitContact(await parseBody(req, contactSchema), req) }, { status: 201 }));
