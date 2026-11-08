import { route } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { authorize } from "@/lib/authz/authorize";
import { AppError } from "@/lib/errors";
import { testProvider } from "@/modules/admin/settings.service";

/** POST /admin/settings/{test-email|test-payment} */
export const POST = route<{ test: string }>(async (req, { params }) => {
  await authorize(await requireActor(req), "settings:manage");
  const t = (await params).test;
  if (t === "test-email") return testProvider("email");
  if (t === "test-payment") return testProvider("payment");
  throw new AppError("NOT_FOUND");
});
