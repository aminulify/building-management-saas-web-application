import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireRole } from "@/lib/authz/authorize";
import type { Actor } from "@/lib/auth/require-actor";
import { signStorageKey, signStorageKeys } from "@/modules/uploads/service";
import { filled, profileStrength } from "./profile-strength";

type DocState = { status: "PENDING" | "VERIFIED" | "REJECTED"; date: Date; notes: string | null } | null;

/**
 * Everything the Owner Profile page shows in one call: who they are, how complete the profile is, the portfolio
 * numbers and properties, and the state of the NID photos and of the tenants' agreements.
 */
export async function ownerOverview(actor: Actor) {
  requireRole(actor, "OWNER");
  const u = await db.user.findUnique({ where: { id: actor.id }, include: { address: true, ownerProfile: { select: { businessName: true, bkashNumber: true } } } });
  if (!u) throw new AppError("NOT_FOUND");

  const [props, docs, agreements, tenants] = await Promise.all([
    db.property.findMany({
      where: { ownerId: actor.id, archivedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
      include: { address: true, images: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 1 }, _count: { select: { units: { where: { archivedAt: null } } } } },
    }),
    db.verificationDocument.findMany({ where: { ownerType: "USER", ownerId: actor.id, kind: { in: ["NID_FRONT", "NID_BACK"] } }, orderBy: { id: "desc" }, select: { kind: true, status: true, createdAt: true, notes: true } }),
    db.rentalAgreement.findMany({ where: { ownerId: actor.id, status: "ACTIVE" }, select: { agreementDocKey: true, updatedAt: true } }),
    db.rentalAgreement.count({ where: { ownerId: actor.id, status: "ACTIVE" } }),
  ]);
  const [unitCount, occupiedByProp] = await Promise.all([
    db.unit.count({ where: { property: { ownerId: actor.id, archivedAt: null }, archivedAt: null } }),
    db.unit.groupBy({ by: ["propertyId"], where: { property: { ownerId: actor.id }, archivedAt: null, availability: "OCCUPIED" }, _count: { _all: true } }),
  ]);
  const occupied = new Map(occupiedByProp.map((g) => [g.propertyId, g._count._all]));
  const propertyCount = await db.property.count({ where: { ownerId: actor.id, archivedAt: null } });

  const latest = (kind: "NID_FRONT" | "NID_BACK"): DocState => {
    const d = docs.find((x) => x.kind === kind);
    return d ? { status: d.status === "UNVERIFIED" ? "PENDING" : (d.status as "PENDING" | "VERIFIED" | "REJECTED"), date: d.createdAt, notes: d.notes } : null;
  };
  const nidFront = latest("NID_FRONT");
  const nidBack = latest("NID_BACK");

  const withDoc = agreements.filter((a) => a.agreementDocKey);
  const agreementState = {
    total: agreements.length, uploaded: withDoc.length,
    status: agreements.length === 0 ? ("NONE" as const) : withDoc.length === agreements.length ? ("UPLOADED" as const) : ("PENDING" as const),
    date: withDoc.reduce<Date | null>((m, a) => (!m || a.updatedAt > m ? a.updatedAt : m), null),
  };

  const a = u.address;
  const strength = profileStrength({
    avatar: !!u.avatarKey, fullName: filled(u.fullName), phone: filled(u.phone), email: filled(u.email), occupation: filled(u.occupation), dateOfBirth: !!u.dateOfBirth, nid: !!u.nidLast4,
    division: filled(a?.division), district: filled(a?.district), upazila: filled(a?.upazila), union: filled(a?.union), street: filled(a?.street), postOffice: filled(a?.postOffice),
    nidFront: !!nidFront, nidBack: !!nidBack,
  });

  const covers = await signStorageKeys(props.flatMap((p) => (p.images[0] ? [p.images[0].storageKey] : [])), 3600);
  const avatarUrl = u.avatarKey ? await signStorageKey(u.avatarKey, 3600).then((s) => s.url).catch(() => null) : null;

  return {
    user: {
      id: u.id, username: u.username, ownerCode: u.ownerCode, fullName: u.fullName, email: u.email, phone: u.phone, occupation: u.occupation, gender: u.gender,
      dateOfBirth: u.dateOfBirth, nid: u.nidLast4 ? `•••••••••${u.nidLast4}` : null, memberSince: u.createdAt, verificationStatus: u.verificationStatus, avatarUrl,
      businessName: u.ownerProfile?.businessName ?? null, bkashNumber: u.ownerProfile?.bkashNumber ?? null,
    },
    address: a ? { division: a.division, district: a.district, upazila: a.upazila, union: a.union, street: a.street, postOffice: a.postOffice } : null,
    strength,
    portfolio: { properties: propertyCount, units: unitCount, tenants },
    properties: props.map((p) => ({
      id: p.id, name: p.name, locationLabel: p.locationText || [p.address?.area, p.address?.upazila, p.address?.district].filter(Boolean).join(", "),
      coverUrl: p.images[0] ? covers.get(p.images[0].storageKey) ?? null : null,
      units: Math.max(p.declaredUnits ?? 0, p._count.units), occupied: occupied.get(p.id) ?? 0,
    })),
    documents: { nidFront, nidBack, agreement: agreementState },
  };
}
