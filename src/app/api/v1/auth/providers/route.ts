import { route } from "@/lib/api/handler";
import { getProviders } from "@/modules/auth/oauth";

/** Public: which social sign-ins are switched on (the sign-in page greys out Google when it is not). */
export const GET = route(async () => getProviders());
