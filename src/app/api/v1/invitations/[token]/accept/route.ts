import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { acceptInvitation } from "@/modules/tenancy/service";
import { tokenParam } from "@/modules/tenancy/schema";

export const POST = route<{ token: string }>(async (req, { params }) =>
  acceptInvitation(await requireActor(req), tokenParam.parse((await params).token)),
);
