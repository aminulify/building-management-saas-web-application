import type { Prisma } from "@prisma/client";

/**
 * Rule: a new tenant is invisible to every apartment owner (search by phone, e-mail or Tenant ID, and picking by id)
 * until the profile is completely filled in AND the Super Admin has verified the NID.
 * One definition, used by every owner-side lookup.
 */
export const discoverableWhere: Prisma.UserWhereInput = {
  verificationStatus: "VERIFIED",
  nid: { not: null },
  dateOfBirth: { not: null },
  occupation: { not: null },
  addressId: { not: null },
  phone: { not: null },
  email: { not: null },
};

export interface ProfileFacts { fullName?: string | null; phone?: string | null; email?: string | null; nid?: string | null; dateOfBirth?: Date | null; occupation?: string | null; addressId?: string | null }

const has = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** The profile parts that are still empty (pure, so it is easy to test). */
export function profileGaps(u: ProfileFacts | null | undefined): string[] {
  if (!u) return ["fullName", "phone", "email", "nid", "dateOfBirth", "occupation", "address"];
  const gaps: string[] = [];
  if (!has(u.fullName)) gaps.push("fullName");
  if (!has(u.phone)) gaps.push("phone");
  if (!has(u.email)) gaps.push("email");
  if (!has(u.nid)) gaps.push("nid");
  if (!u.dateOfBirth) gaps.push("dateOfBirth");
  if (!has(u.occupation)) gaps.push("occupation");
  if (!u.addressId) gaps.push("address");
  return gaps;
}

export const isProfileComplete = (u: ProfileFacts | null | undefined) => profileGaps(u).length === 0;
export const isDiscoverable = (u: (ProfileFacts & { verificationStatus: string }) | null | undefined) => !!u && u.verificationStatus === "VERIFIED" && isProfileComplete(u);
