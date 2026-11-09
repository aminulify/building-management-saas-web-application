import { route, parseQuery } from "@/lib/api/handler";
import { googleUrl, oauthUrlQuery } from "@/modules/auth/oauth";

/** Returns the Supabase URL that starts Google sign-in. `redirectTo` must be this site's /bn|en/auth/callback. */
export const GET = route(async (req) => googleUrl(parseQuery(req, oauthUrlQuery), req));
