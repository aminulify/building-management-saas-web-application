import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/require-actor";
import { isOnline } from "./access";
import { avatarUrls } from "./service";

export interface Contact { id: string; fullName: string; username: string; role: Role; avatarUrl: string | null; online: boolean; unit: string | null; property: string | null }

const card = { id: true, fullName: true, username: true, role: true, avatarKey: true, lastSeenAt: true } as const;

/**
 * Who the caller may start a chat with (architecture 4.3):
 *  - owner → tenants with an active agreement on the owner's units
 *  - tenant → the owner of their active agreement
 *  - super admin / government admin → anyone they are allowed to reach, found by name or username (2+ letters)
 */
export async function listContacts(actor: Actor, q?: string): Promise<Contact[]> {
  const needle = q?.trim().toLowerCase() ?? "";
  if (actor.role === "OWNER" || actor.role === "TENANT") {
    const owner = actor.role === "OWNER";
    const rows = await db.rentalAgreement.findMany({
      where: { status: "ACTIVE", ...(owner ? { ownerId: actor.id } : { tenantId: actor.id }) },
      select: { ownerId: true, tenantId: true, unit: { select: { unitNumber: true, property: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    const otherId = (r: (typeof rows)[number]) => (owner ? r.tenantId : r.ownerId);
    const users = new Map((await db.user.findMany({ where: { id: { in: rows.map(otherId) }, status: "ACTIVE" }, select: card })).map((u) => [u.id, u]));
    const avatar = await avatarUrls([...users.values()].map((u) => u.avatarKey));
    const seen = new Set<string>();
    const out: Contact[] = [];
    for (const r of rows) {
      const u = users.get(otherId(r));
      if (!u || seen.has(u.id)) continue;
      seen.add(u.id);
      const c: Contact = { id: u.id, fullName: u.fullName, username: u.username, role: u.role, avatarUrl: avatar(u.avatarKey), online: isOnline(u.lastSeenAt), unit: r.unit.unitNumber, property: r.unit.property.name };
      if (!needle || [c.fullName, c.username, c.unit, c.property].some((x) => x?.toLowerCase().includes(needle))) out.push(c);
    }
    return out;
  }
  if ((actor.role === "SUPER_ADMIN" || actor.role === "GOV_ADMIN") && needle.length >= 2) {
    const roles: Role[] = actor.role === "SUPER_ADMIN" ? ["OWNER", "TENANT", "GOV_ADMIN", "GENERAL_USER"] : ["OWNER", "TENANT", "SUPER_ADMIN", "GOV_ADMIN"];
    const users = await db.user.findMany({
      where: { status: "ACTIVE", id: { not: actor.id }, role: { in: roles }, OR: [{ fullName: { contains: needle, mode: "insensitive" } }, { username: { contains: needle, mode: "insensitive" } }] },
      select: card, orderBy: { fullName: "asc" }, take: 20,
    });
    const avatar = await avatarUrls(users.map((u) => u.avatarKey));
    return users.map((u) => ({ id: u.id, fullName: u.fullName, username: u.username, role: u.role, avatarUrl: avatar(u.avatarKey), online: isOnline(u.lastSeenAt), unit: null, property: null }));
  }
  return [];
}
