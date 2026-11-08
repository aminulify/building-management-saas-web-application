import { route, parseQuery } from "@/lib/api/handler";
import { cmsQuery, getCms } from "@/modules/public/service";

/** Public CMS block: homepage hero, features, about, testimonials… */
export const GET = route<{ key: string }>(async (req, { params }) => getCms((await params).key, parseQuery(req, cmsQuery).locale));
