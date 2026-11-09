import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale prefix only. This is never the security boundary: every API route checks the actor itself.
export default createMiddleware(routing);

export const config = {
  // skip the REST API, Next internals and static files (anything with a dot)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
