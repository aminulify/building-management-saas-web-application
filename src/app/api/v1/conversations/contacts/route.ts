import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { listContacts } from "@/modules/messaging/contacts.service";
import { contactsQuery } from "@/modules/messaging/schema";

/** People the caller may start a chat with (owner → own tenants, tenant → own owner, admins → search). */
export const GET = route(async (req) => {
  const actor = await requireActor(req);
  return listContacts(actor, parseQuery(req, contactsQuery).q);
});
