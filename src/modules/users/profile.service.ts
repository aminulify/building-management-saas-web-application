import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase";
import type { Actor } from "@/lib/auth/require-actor";
import { getEntitlement } from "@/lib/authz/entitlement";
import { passwordSchema } from "@/modules/auth/schema";
import { bdPhoneSchema } from "./schema";

const address = z.object({
  division: z.string().trim().min(2).max(60), district: z.string().trim().min(2).max(60),
  upazila: z.string().trim().max(60).optional(), area: z.string().trim().max(100).optional(),
  street: z.string().trim().max(200).optional(), postalCode: z.string().regex(/^\d{4}$/).optional(),
});

/** Profile Settings for every role (4.16 / 5.9 / 6.10 / 7.17). Role-specific blocks are ignored for other roles. */
export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: bdPhoneSchema,
  locale: z.enum(["bn", "en"]),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dateOfBirth: z.coerce.date().max(new Date()),
  avatarKey: z.string().min(10).max(300),
  /** notification preferences, e.g. { email: true, sms: false, push: true } */
  preferences: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).refine((v) => JSON.stringify(v).length < 2000, "too_large"),
  address,
  owner: z.object({ businessName: z.string().trim().max(120) }).partial().strict(),
  tenant: z.object({ emergencyContact: bdPhoneSchema, occupation: z.string().trim().max(80) }).partial().strict(),
  gov: z.object({ department: z.string().trim().max(100), designation: z.string().trim().max(100) }).partial().strict(),
}).partial().strict().refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

const select = {
  id: true, username: true, ownerCode: true, role: true, status: true, fullName: true, email: true, phone: true, nidLast4: true,
  verificationStatus: true, locale: true, gender: true, dateOfBirth: true, avatarKey: true, preferences: true, createdAt: true,
  address: true, ownerProfile: { select: { businessName: true } }, tenantProfile: { select: { emergencyContact: true, occupation: true } }, govAdminProfile: { select: { department: true, designation: true } },
} as const;

export async function getProfile(actor: Actor) {
  const user = await db.user.findUnique({ where: { id: actor.id }, select });
  if (!user) throw new AppError("NOT_FOUND");
  const [owner, seller] = await Promise.all([getEntitlement(actor.id, "OWNER"), getEntitlement(actor.id, "SELLER")]);
  const pendingUpgrade = await db.upgradeRequest.findFirst({ where: { userId: actor.id, status: "PENDING" }, select: { id: true, createdAt: true } });
  const { nidLast4, ...rest } = user;
  return { ...rest, nid: nidLast4 ? `•••••••••${nidLast4}` : null, entitlement: owner, sellerEntitlement: seller, pendingUpgrade };
}

export async function updateProfile(actor: Actor, input: z.infer<typeof profileUpdateSchema>, req: Request) {
  const { owner, tenant, gov, avatarKey, address: addr, ...base } = input;
  if (avatarKey && (avatarKey.split("/")[0] !== "AVATAR" || avatarKey.split("/")[1] !== actor.id)) throw new AppError("FORBIDDEN", { reason: "not_your_upload" });
  if (gov && actor.role !== "GOV_ADMIN") throw new AppError("FORBIDDEN", { reason: "gov_only" });

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { ...base, avatarKey } });
      if (addr) {
        const cur = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { addressId: true } });
        if (cur.addressId) await tx.address.update({ where: { id: cur.addressId }, data: addr });
        else await tx.user.update({ where: { id: actor.id }, data: { addressId: (await tx.address.create({ data: addr })).id } });
      }
      if (owner && actor.role === "OWNER") await tx.ownerProfile.upsert({ where: { userId: actor.id }, update: owner, create: { userId: actor.id, ...owner } });
      if (tenant && actor.role === "TENANT") await tx.tenantProfile.upsert({ where: { userId: actor.id }, update: tenant, create: { userId: actor.id, ...tenant } });
      if (gov) await tx.govAdminProfile.update({ where: { userId: actor.id }, data: gov });
      await writeAudit({ actor, action: "profile.update", resourceType: "User", resourceId: actor.id, after: { fields: Object.keys(input) }, req }, tx);
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("CONFLICT", { field: "phone" });
    throw e;
  }
  return getProfile(actor);
}

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(72), newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, { message: "same_password", path: ["newPassword"] });

/** Signed-in password change: the current password must be proven first. */
export async function changePassword(actor: Actor, input: z.infer<typeof changePasswordSchema>, req: Request) {
  rateLimit(`pwchange:${actor.id}`, 5, 15 * 60_000);
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { email: true, authId: true } });
  if (!u.email || !u.authId) throw new AppError("INVALID_STATE");
  const { error } = await supabaseAnon().auth.signInWithPassword({ email: u.email, password: input.currentPassword });
  if (error) throw new AppError("FORBIDDEN", { reason: "wrong_current_password" });
  const { error: upErr } = await supabaseAdmin().auth.admin.updateUserById(u.authId, { password: input.newPassword });
  if (upErr) throw new AppError("VALIDATION_ERROR", [{ path: "newPassword", code: "rejected" }]);
  await writeAudit({ actor, action: "password.change", resourceType: "User", resourceId: actor.id, req });
  return { changed: true };
}
