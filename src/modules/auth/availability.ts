import type { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { availabilityQuery } from "./schema";

/** Live "already taken?" hints for the sign-up form. Rate limited per IP; answers only yes/no. */
export async function checkAvailability(q: z.infer<typeof availabilityQuery>, req: Request) {
  rateLimit(`avail:${clientIp(req)}`, 40, 60_000);
  const out: { username?: boolean; email?: boolean; phone?: boolean } = {};
  if (q.username) out.username = !(await db.user.count({ where: { username: q.username } }));
  if (q.email) out.email = !(await db.user.count({ where: { email: q.email } }));
  if (q.phone) out.phone = !(await db.user.count({ where: { phone: q.phone } }));
  return out;
}
