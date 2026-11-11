import { z } from "zod";
import { normalizePhone } from "@/modules/auth/register/schema";
import type { TenantOverview } from "./types";

const text = (min: number, max: number, key: string) => z.string().trim().min(min, key).max(max, key);

/** Update Profile form (error strings are keys under `validation.*`). The Tenant ID is not in it: it can never change. */
export const profileFormSchema = z.object({
  fullName: text(2, 100, "fullNameMin"),
  phone: z.string().trim().refine((v) => /^01[3-9]\d{8}$/.test(normalizePhone(v)), "phoneInvalid"),
  email: z.string().trim().toLowerCase().email("emailInvalid"),
  occupation: z.string().trim().max(80, "occupationMax"),
  nid: z.string().trim().regex(/^\d{13,17}$/, "nidFormat"),
  dateOfBirth: z.string().min(1, "dobRequired").refine((v) => v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10), "dobInvalid"),
  members: z.string().trim().regex(/^\d{1,2}$/, "membersInvalid").refine((v) => Number(v) >= 1 && Number(v) <= 30, "membersInvalid"),
  division: text(2, 60, "divisionRequired"),
  district: text(2, 60, "districtRequired"),
  upazila: z.string().trim().max(60, "tooLong"),
  union: z.string().trim().max(80, "tooLong"),
  street: z.string().trim().max(200, "tooLong"),
  postOffice: z.string().trim().max(80, "tooLong"),
});
export type ProfileFormValues = z.input<typeof profileFormSchema>;

const ADDRESS = ["division", "district", "upazila", "union", "street", "postOffice"] as const;

/** The form's starting values from what the server has. */
export function formFrom(d: TenantOverview): ProfileFormValues {
  const a = d.address;
  return {
    fullName: d.user.fullName, phone: d.user.phone ?? "", email: d.user.email ?? "", occupation: d.user.occupation ?? "", nid: d.user.nid ?? "",
    dateOfBirth: d.user.dateOfBirth ? d.user.dateOfBirth.slice(0, 10) : "", members: String(d.user.members),
    division: a?.division ?? "", district: a?.district ?? "", upazila: a?.upazila ?? "", union: a?.union ?? "", street: a?.street ?? "", postOffice: a?.postOffice ?? "",
  };
}

/** Only what changed, in the shape of PATCH /me (the address goes as one block, the member count inside `tenant`). */
export function profilePatch(f: ProfileFormValues, d: TenantOverview): Record<string, unknown> {
  const before = formFrom(d);
  const out: Record<string, unknown> = {};
  if (f.fullName.trim() !== before.fullName) out.fullName = f.fullName.trim();
  if (normalizePhone(f.phone) !== before.phone) out.phone = normalizePhone(f.phone);
  if (f.email.trim().toLowerCase() !== (before.email ?? "").toLowerCase()) out.email = f.email.trim().toLowerCase();
  if (f.occupation.trim() !== before.occupation) out.occupation = f.occupation.trim();
  if (f.nid.trim() !== before.nid) out.nid = f.nid.trim();
  if (f.dateOfBirth !== before.dateOfBirth) out.dateOfBirth = f.dateOfBirth;
  if (Number(f.members) !== Number(before.members)) out.tenant = { members: Number(f.members) };
  if (ADDRESS.some((k) => (f[k] ?? "").trim() !== (before[k] ?? ""))) {
    out.address = { division: f.division.trim(), district: f.district.trim(), ...Object.fromEntries(ADDRESS.slice(2).filter((k) => (f[k] ?? "").trim()).map((k) => [k, (f[k] ?? "").trim()])) };
  }
  return out;
}

/** "Tenant Free" for a new sign-up, "Tenant" once an owner connected the person to a unit. */
export const statusKey = (role: TenantOverview["user"]["role"]) => (role === "GENERAL_USER" ? "free" : "verified");
