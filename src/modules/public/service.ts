import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";
import { bdPhoneSchema } from "@/modules/users/schema";

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: bdPhoneSchema.optional(),
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(3000),
  /** honeypot: real users never fill it */
  website: z.string().max(500).optional(),
});

export async function submitContact(input: z.infer<typeof contactSchema>, req: Request) {
  rateLimit(`contact:${clientIp(req)}`, 3, 3600_000);
  if (input.website) return { received: true }; // bot: pretend success, store nothing
  const { website: _w, ...data } = input;
  await db.contactInquiry.create({ data });
  return { received: true };
}

export const cmsQuery = z.object({ locale: z.enum(["bn", "en"]).default("bn") });

/** Public CMS blocks (hero, features, about, testimonials). Falls back to the other language if missing. */
export async function getCms(key: string, locale: "bn" | "en") {
  const k = z.string().regex(/^[a-z0-9._-]{2,60}$/).parse(key);
  const row = (await db.cmsContent.findUnique({ where: { key_locale: { key: k, locale } } })) ?? (await db.cmsContent.findFirst({ where: { key: k } }));
  if (!row) throw new AppError("NOT_FOUND");
  return { key: row.key, locale: row.locale, data: row.data };
}

export const cmsPutSchema = z.object({ locale: z.enum(["bn", "en"]), data: z.record(z.string(), z.unknown()) });

export async function putCms(actor: Actor, key: string, input: z.infer<typeof cmsPutSchema>, req: Request) {
  const k = z.string().regex(/^[a-z0-9._-]{2,60}$/).parse(key);
  const row = await db.cmsContent.upsert({
    where: { key_locale: { key: k, locale: input.locale } },
    update: { data: input.data as object },
    create: { key: k, locale: input.locale, data: input.data as object },
  });
  await writeAudit({ actor, action: "cms.update", resourceType: "CmsContent", resourceId: row.id, after: { key: k, locale: input.locale }, req });
  return row;
}

export const listInquiries = () => db.contactInquiry.findMany({ orderBy: { id: "desc" }, take: 100 });
