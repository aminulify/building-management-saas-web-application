import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { signStorageKey } from "@/modules/uploads/service";
import { addressLine } from "@/modules/dashboards/tenant";
import { ensureTenantCode } from "./tenant-code";

type DocStatus = "PENDING" | "VERIFIED" | "REJECTED";
type DocState = { status: DocStatus; date: Date; notes: string | null } | null;

const status = (s: string): DocStatus => (s === "UNVERIFIED" ? "PENDING" : (s as DocStatus));

/**
 * Everything the "Tenant Free / Tenant Profile" page shows in one call (a Tenant-Free account and a verified tenant share it):
 * identity with the permanent Tenant ID, address, and the state of the NID photos and the agreement.
 */
export async function tenantOverview(actor: Actor) {
  requireRole(actor, "TENANT", "GENERAL_USER");
  const tenantCode = await ensureTenantCode(actor.id);
  const u = await db.user.findUnique({ where: { id: actor.id }, include: { address: true, tenantProfile: { select: { members: true } } } });
  if (!u) throw new AppError("NOT_FOUND");

  const [docs, agreement, lease] = await Promise.all([
    db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: actor.id, kind: { in: ["NID_FRONT", "NID_BACK", "AGREEMENT"] } }, orderBy: { id: "desc" }, select: { kind: true, status: true, createdAt: true, notes: true } }),
    // the signed copy the landlord keeps for the active tenancy
    db.rentalAgreement.findFirst({ where: { tenantId: actor.id, status: "ACTIVE", agreementDocKey: { not: null } }, select: { updatedAt: true } }),
    // the home the tenant lives in now (the "Current Unit" card)
    db.rentalAgreement.findFirst({
      where: { tenantId: actor.id, status: "ACTIVE" }, orderBy: { startDate: "desc" },
      select: { ownerId: true, startDate: true, endDate: true, unit: { select: { unitNumber: true, floor: true, property: { select: { name: true, locationText: true, address: { select: { area: true, upazila: true, district: true, postalCode: true } } } } } } },
    }),
  ]);
  const landlord = lease ? await db.user.findUnique({ where: { id: lease.ownerId }, select: { fullName: true, ownerCode: true } }) : null;
  const latest = (kind: "NID_FRONT" | "NID_BACK" | "AGREEMENT"): DocState => {
    const d = docs.find((x) => x.kind === kind);
    return d ? { status: status(d.status), date: d.createdAt, notes: d.notes } : null;
  };
  const own = latest("AGREEMENT");
  const avatarUrl = u.avatarKey ? await signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : null;
  const a = u.address;

  return {
    user: {
      id: u.id, username: u.username, tenantCode, role: u.role, fullName: u.fullName, email: u.email, phone: u.phone, occupation: u.occupation,
      dateOfBirth: u.dateOfBirth, nid: u.nid, members: u.tenantProfile?.members ?? 1, memberSince: u.createdAt, verificationStatus: u.verificationStatus, avatarUrl,
    },
    tenancy: lease ? {
      property: { name: lease.unit.property.name, addressLine: addressLine(lease.unit.property) }, unit: { unitNumber: lease.unit.unitNumber, floor: lease.unit.floor },
      landlord: landlord ? { fullName: landlord.fullName, ownerCode: landlord.ownerCode } : null, startDate: lease.startDate, endDate: lease.endDate,
    } : null,
    address: a ? { division: a.division, district: a.district, upazila: a.upazila, union: a.union, street: a.street, postOffice: a.postOffice } : null,
    documents: {
      nidFront: latest("NID_FRONT"), nidBack: latest("NID_BACK"),
      /** the tenant's own upload, else the landlord's file for the active tenancy, else nothing */
      agreement: own ? { source: "OWN" as const, ...own } : agreement ? { source: "LANDLORD" as const, status: "VERIFIED" as const, date: agreement.updatedAt, notes: null } : null,
    },
  };
}
