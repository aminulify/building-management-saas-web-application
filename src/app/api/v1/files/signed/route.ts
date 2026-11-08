import { z } from "zod";
import { route, parseQuery } from "@/lib/api/handler";
import { requireActor } from "@/lib/auth/require-actor";
import { signRead } from "@/modules/uploads/service";

const q = z.object({ key: z.string().min(10).max(300) });

/** 5-minute read link for your own upload (Super Admin: any). */
export const GET = route(async (req) => signRead(await requireActor(req), parseQuery(req, q).key));
