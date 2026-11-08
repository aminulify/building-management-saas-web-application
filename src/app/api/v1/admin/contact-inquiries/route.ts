import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { listInquiries } from "@/modules/public/service";

export const GET = route(async (req) => {
  await authorize(await requireActor(req), "settings:manage");
  return listInquiries();
});
