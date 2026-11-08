import { z } from "zod";
import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { pageQuery } from "@/lib/api/common";
import { directoryQuery, listProperties } from "@/modules/directory/service";

const q = directoryQuery.extend({ verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]).optional() });

export const GET = route(async (req) => listProperties(await requireActor(req), parseQuery(req, q), parseQuery(req, pageQuery)));
