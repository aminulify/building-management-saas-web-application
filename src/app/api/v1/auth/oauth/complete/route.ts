import { route, parseBody } from "@/lib/api/handler";
import { bearerToken } from "@/lib/auth/bearer";
import { completeOAuth, completeSchema } from "@/modules/auth/oauth";

/** After Google: creates the free account on first use, or returns the existing one. Bearer = Supabase access token. */
export const POST = route(async (req) => {
  const token = bearerToken(req);
  const body = await parseBody(req, completeSchema).catch(() => completeSchema.parse({}));
  return completeOAuth(token, body, req);
});
