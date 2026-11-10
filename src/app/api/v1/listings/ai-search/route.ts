import { route, parseBody } from "@/lib/api/handler";
import { optionalActor } from "@/lib/auth/require-actor";
import { aiSearch } from "@/modules/marketplace/ai-search.service";
import { aiSearchSchema } from "@/modules/marketplace/schema";

/** Free, offline "AI" search: understands a sentence (English or Bangla), returns filters + homes ranked by match %. */
export const POST = route(async (req) => aiSearch(await optionalActor(req), await parseBody(req, aiSearchSchema), req));
