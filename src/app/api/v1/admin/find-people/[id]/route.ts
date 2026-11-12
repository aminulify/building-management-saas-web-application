import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { personFull } from "@/modules/admin/find-people/service";

/** The full profile of one found person: header plus the owner, tenant or Tenant-Free part. */
export const GET = route<{ id: string }>(async (req, { params }) => personFull(await requireActor(req), idParam((await params).id), req));
