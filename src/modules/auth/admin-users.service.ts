import type { Role, UserStatus } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase";
import type { Actor } from "@/lib/auth/require-actor";
import { pageArgs, pageResult, type pageQuery } from "@/lib/api/common";
import type { adminCreateUserSchema, adminUsersQuery } from "./schema";

const select = {
  id: true, username: true, ownerCode: true, role: true, status: true, fullName: true, email: true,
  phone: true, nidLast4: true, verificationStatus: true, createdAt: true, archivedAt: true,
} as const;

export async function listUsers(q: z.infer<typeof adminUsersQuery>, page: z.infer<typeof pageQuery>) {
  const rows = await db.user.findMany({
    where: {
      role: q.role,
      status: q.status,
      ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: "insensitive" } }, { username: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }, { phone: { contains: q.q } }] } : {}),
    },
    select,
    ...pageArgs(page),
  });
  return pageResult(rows, page.limit);
}

/** Only a Super Admin can create GOV_ADMIN / SUPER_ADMIN accounts. */
export async function createStaffUser(actor: Actor, input: z.infer<typeof adminCreateUserSchema>, req: Request) {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
  });
  if (error || !data.user) throw new AppError("CONFLICT", { field: "email" });
  try {
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          authId: data.user.id, username: input.username, fullName: input.fullName, email: input.email,
          phone: input.phone, role: input.role, verificationStatus: "VERIFIED",
          ...(input.role === "GOV_ADMIN"
            ? { govAdminProfile: { create: { department: input.department, designation: input.designation, createdById: actor.id } } }
            : {}),
        },
        select,
      });
      await writeAudit({ actor, action: "user.create", resourceType: "User", resourceId: u.id, after: { role: input.role }, req }, tx);
      return u;
    });
    return user;
  } catch (e) {
    await supabaseAdmin().auth.admin.deleteUser(data.user.id);
    if ((e as { code?: string }).code === "P2002") throw new AppError("CONFLICT");
    throw e;
  }
}

/** The last active Super Admin may not be suspended or demoted (architecture 4.4). */
async function assertNotLastSuperAdmin(userId: string) {
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (target?.role !== "SUPER_ADMIN" || target.status !== "ACTIVE") return;
  const others = await db.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE", id: { not: userId } } });
  if (others === 0) throw new AppError("INVALID_STATE", { reason: "last_super_admin" });
}

export async function setUserStatus(actor: Actor, id: string, status: UserStatus, reason: string | undefined, req: Request) {
  if (id === actor.id && status !== "ACTIVE") throw new AppError("INVALID_STATE", { reason: "self" });
  if (status !== "ACTIVE") await assertNotLastSuperAdmin(id);
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw new AppError("NOT_FOUND");
    const user = await tx.user.update({
      where: { id },
      data: { status, archiveReason: status === "ACTIVE" ? null : reason, archivedAt: status === "ACTIVE" ? null : new Date() },
      select,
    });
    await writeAudit({ actor, action: `user.${status.toLowerCase()}`, resourceType: "User", resourceId: id, before: { status: before.status }, after: { status, reason: reason ?? null }, req }, tx);
    return user;
  });
}

export async function setUserRole(actor: Actor, id: string, role: Role, req: Request) {
  const target = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw new AppError("NOT_FOUND");
  if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") await assertNotLastSuperAdmin(id);
  return db.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id }, data: { role }, select });
    if (role === "GOV_ADMIN") await tx.govAdminProfile.upsert({ where: { userId: id }, update: {}, create: { userId: id, createdById: actor.id } });
    await writeAudit({ actor, action: "user.role", resourceType: "User", resourceId: id, before: { role: target.role }, after: { role }, req }, tx);
    return user;
  });
}

/** Super Admin opens a user to check the NID by hand. Every view is audit-logged (architecture 11.1). */
export async function getUserForReview(actor: Actor, id: string, req: Request) {
  const u = await db.user.findUnique({ where: { id }, select: { ...select, nid: true, dateOfBirth: true, gender: true } });
  if (!u) throw new AppError("NOT_FOUND");
  await writeAudit({ actor, action: "user.nid_view", resourceType: "User", resourceId: id, req });
  return u;
}

export async function verifyUser(actor: Actor, id: string, status: "VERIFIED" | "REJECTED", notes: string | undefined, req: Request) {
  const before = await db.user.findUnique({ where: { id }, select: { verificationStatus: true } });
  if (!before) throw new AppError("NOT_FOUND");
  return db.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { verificationStatus: status }, select });
    await notify([id], { type: "user.verification", titleKey: "notifications.verification", params: { status, notes: notes ?? "" } }, tx);
    await writeAudit({ actor, action: "user.verify", resourceType: "User", resourceId: id, before: { status: before.verificationStatus }, after: { status, notes: notes ?? null }, req }, tx);
    return u;
  });
}

export async function updateUser(actor: Actor, id: string, data: { fullName?: string; phone?: string; locale?: string }, req: Request) {
  const before = await db.user.findUnique({ where: { id }, select: { fullName: true, phone: true, locale: true } });
  if (!before) throw new AppError("NOT_FOUND");
  try {
    return await db.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data, select });
      await writeAudit({ actor, action: "user.update", resourceType: "User", resourceId: id, before, after: data, req }, tx);
      return u;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new AppError("CONFLICT", { field: "phone" });
    throw e;
  }
}
