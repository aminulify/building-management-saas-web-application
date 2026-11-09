import { z } from "zod";
import { route, parseBody } from "@/lib/api/handler";
import { refresh } from "@/modules/auth/service";

const body = z.object({ refreshToken: z.string().min(10).max(600) });

/** "Stay logged in": trade a refresh token for a fresh access token. */
export const POST = route(async (req) => refresh((await parseBody(req, body)).refreshToken, req));
