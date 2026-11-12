import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { personProfile } from "@/modules/admin/people/service";

/** Super Admin: one card for any owner, tenant, Tenant-Free or Government account (opened from the Message page). */
export const GET = route<{ id: string }>(async (req, { params }) => personProfile(await requireActor(req), idParam((await params).id)));
