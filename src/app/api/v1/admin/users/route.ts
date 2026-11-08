import { NextResponse } from "next/server";
import { route, parseBody, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { pageQuery } from "@/lib/api/common";
import { createStaffUser, listUsers } from "@/modules/auth/admin-users.service";
import { adminCreateUserSchema, adminUsersQuery } from "@/modules/auth/schema";

export const GET = route(async (req) => {
  const actor = await requireActor(req);
  await authorize(actor, "user:manage");
  return listUsers(parseQuery(req, adminUsersQuery), parseQuery(req, pageQuery));
});

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  await authorize(actor, "govadmin:manage");
  const user = await createStaffUser(actor, await parseBody(req, adminCreateUserSchema), req);
  return NextResponse.json({ data: user }, { status: 201 });
});
