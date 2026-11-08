import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { register } from "@/modules/auth/service";
import { registerSchema } from "@/modules/auth/schema";

export const POST = route(async (req) => {
  const user = await register(await parseBody(req, registerSchema), req);
  return NextResponse.json({ data: user }, { status: 201 });
});
