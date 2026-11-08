import { z } from "zod";
import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { idParam } from "@/lib/api/common";
import { reportIssue } from "@/modules/directory/property-review.service";

const body = z.object({ notes: z.string().trim().min(3).max(500) });

/** Gov Admin "Report Issue" on a property: notifies Super Admins, changes nothing. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const actor = await requireActor(req);
  return reportIssue(actor, idParam((await params).id), (await parseBody(req, body)).notes, req);
});
