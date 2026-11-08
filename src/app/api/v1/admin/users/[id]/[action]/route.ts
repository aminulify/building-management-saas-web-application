import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { idParam } from "@/lib/api/common";
import { AppError } from "@/lib/errors";
import { setUserRole, setUserStatus, verifyUser } from "@/modules/auth/admin-users.service";
import { roleChangeSchema, suspendSchema, verifyUserSchema } from "@/modules/auth/schema";

/** POST /admin/users/:id/{suspend|activate|role|verify} */
export const POST = route<{ id: string; action: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  await authorize(actor, "user:manage");
  const { id: rawId, action } = await params;
  const id = idParam(rawId);

  switch (action) {
    case "suspend": {
      const b = await parseBody(req, suspendSchema);
      return setUserStatus(actor, id, b.status, b.reason, req);
    }
    case "archive": {
      const b = await parseBody(req, suspendSchema.pick({ reason: true }));
      return setUserStatus(actor, id, "INACTIVE", b.reason, req);
    }
    case "activate":
      return setUserStatus(actor, id, "ACTIVE", undefined, req);
    case "verify": {
      const b = await parseBody(req, verifyUserSchema);
      return verifyUser(actor, id, b.status, b.notes, req);
    }
    case "role":
      return setUserRole(actor, id, (await parseBody(req, roleChangeSchema)).role, req);
    default:
      throw new AppError("NOT_FOUND");
  }
});
