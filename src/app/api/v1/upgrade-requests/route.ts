import { NextResponse } from "next/server";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { createUpgradeRequest } from "@/modules/billing/upgrade.service";
import { upgradeRequestSchema } from "@/modules/billing/upgrade-schema";

export const POST = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json({ data: await createUpgradeRequest(actor, await parseBody(req, upgradeRequestSchema), req) }, { status: 201 });
});
