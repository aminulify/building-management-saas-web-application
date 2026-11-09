import { route, parseBody } from "@/lib/api/handler";
import { signRegistrationUpload } from "@/modules/auth/registration-uploads";
import { regUploadSchema } from "@/modules/auth/schema";

/** Public: signed upload URL for NID front/back and profile photo during sign-up. */
export const POST = route(async (req) => signRegistrationUpload(await parseBody(req, regUploadSchema), req));
