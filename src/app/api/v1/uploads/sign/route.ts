import { route, parseBody } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { signSchema, signUpload } from "@/modules/uploads/service";

/** Returns a one-time signed upload URL for a private bucket. Type and size limits are enforced here. */
export const POST = route(async (req) => signUpload(await requireActor(req), await parseBody(req, signSchema)));
