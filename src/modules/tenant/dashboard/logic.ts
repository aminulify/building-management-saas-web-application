import { z } from "zod";
import type { ActivityItem, PayState, RepairStatus, SosStage, TenantDashboard } from "./types";

/** "Rahim Uddin" → "Rahim" (Bangla names too). */
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? "";

/** 01712345678 → tel:+8801712345678 (a number already in +880 form is kept). */
export function phoneHref(phone: string | null | undefined): string | null {
  const p = (phone ?? "").replace(/[\s-]/g, "");
  if (/^01\d{9}$/.test(p)) return `tel:+88${p}`;
  if (/^\+8801\d{9}$/.test(p)) return `tel:${p}`;
  return null;
}

/** 01712345678 → +880 1712-345678 */
export const showPhone = (phone: string | null | undefined) => (phone && /^01\d{9}$/.test(phone) ? `+880 ${phone.slice(1, 5)}-${phone.slice(5)}` : phone || "—");

/** "Shanti Nibash, Unit - 102, South Keraniganj, Dhaka - 1311": the address the SOS form fills in by itself. */
export const sosAddress = (property: string, unit: string, addressLine: string) => [property, `Unit - ${unit}`, addressLine].filter((x) => x && x.trim()).join(", ");

/** What the "Send Paid Request" button does: ask, wait for the owner, or nothing yet (no bill exists for that month). */
export type PayButton = "send" | "pending" | "notBilled";
export function payButton(n: NonNullable<TenantDashboard["nextPayment"]>): PayButton {
  if (n.pending) return "pending";
  return n.recordId ? "send" : "notBilled";
}
export const isLate = (s: PayState) => s === "OVERDUE";

/* ---------- Recent Activity ---------- */
export type Tone = "green" | "blue" | "yellow" | "red" | "gray";
export const TONE_STYLE: Record<Tone, string> = {
  green: "bg-green-100/90 text-green-700 border-green-300",
  blue: "bg-sky-100/90 text-sky-700 border-sky-300",
  yellow: "bg-yellow-100/90 text-yellow-800 border-yellow-300",
  red: "bg-red-100/90 text-red-700 border-red-300",
  gray: "bg-slate-100/90 text-slate-600 border-slate-300",
};

/** i18n key (under tenant.dashboard.activity.status) and colour of each activity row. */
export function activityStatus(a: Pick<ActivityItem, "kind" | "status">): { key: string; tone: Tone } {
  switch (a.kind) {
    case "payment": return a.status === "VERIFIED" ? { key: "completed", tone: "green" } : a.status === "REJECTED" ? { key: "rejected", tone: "red" } : { key: "pendingVerification", tone: "yellow" };
    case "repair":
      if (a.status === "COMPLETED") return { key: "completed", tone: "green" };
      if (a.status === "IN_PROGRESS") return { key: "inProgress", tone: "blue" };
      if (a.status === "REJECTED") return { key: "rejected", tone: "red" };
      if (a.status === "CANCELLED") return { key: "cancelled", tone: "gray" };
      return { key: "pending", tone: "yellow" };
    case "incident":
      if (a.status === "RESOLVED") return { key: "resolved", tone: "green" };
      if (a.status === "IN_REVIEW") return { key: "inReview", tone: "blue" };
      if (a.status === "REJECTED") return { key: "rejected", tone: "red" };
      return { key: "open", tone: "yellow" };
    default:
      if (a.status === "SOLVED") return { key: "solved", tone: "green" };
      if (a.status === "PROCESSING") return { key: "inProgress", tone: "blue" };
      if (a.status === "FALSE_ALARM") return { key: "falseAlarm", tone: "gray" };
      return { key: "sent", tone: "red" };
  }
}

/** Position on the Pending → In Progress → Completed line (a rejected or cancelled request has none). */
export function repairStep(s: RepairStatus): number | null {
  if (s === "PENDING" || s === "APPROVED") return 0;
  if (s === "IN_PROGRESS") return 1;
  if (s === "COMPLETED") return 2;
  return null;
}

/** Received by AmaderGhor → Seen by the government team → Forwarded → Solved. */
export const SOS_STEPS: SosStage[] = ["RECEIVED_BY_PLATFORM", "SEEN_BY_GOV", "FORWARDED", "SOLVED"];
export const sosStep = (s: SosStage) => SOS_STEPS.indexOf(s);

/* ---------- forms (error strings are keys under `validation.*`) ---------- */
export const PAY_METHODS = ["BKASH", "NAGAD", "ROCKET", "BANK"] as const;
export const payFormSchema = z.object({
  method: z.enum(PAY_METHODS),
  reference: z.string().trim().min(4, "trxShort").max(40, "trxLong").regex(/^[A-Za-z0-9\-_/]+$/, "trxChars"),
});
export type PayFormValues = z.input<typeof payFormSchema>;

export const REPAIR_CATEGORIES = ["PLUMBING", "ELECTRICAL", "WATER", "GAS", "LIFT", "PAINT", "SECURITY", "CLEANING", "OTHER"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const repairFormSchema = z.object({
  category: z.enum(REPAIR_CATEGORIES),
  priority: z.enum(PRIORITIES),
  title: z.string().trim().min(3, "titleShort").max(120, "titleLong"),
  description: z.string().trim().min(5, "descShort").max(2000, "descLong"),
});
export type RepairFormValues = z.input<typeof repairFormSchema>;

export const INCIDENT_CATEGORIES = ["SECURITY", "NOISE", "BEHAVIOUR", "FACILITY", "PAYMENT", "OTHER"] as const;
export const incidentFormSchema = z.object({
  category: z.enum(INCIDENT_CATEGORIES),
  subject: z.string().trim().min(3, "titleShort").max(120, "titleLong"),
  description: z.string().trim().min(10, "incidentDescShort").max(3000, "descLong"),
});
export type IncidentFormValues = z.input<typeof incidentFormSchema>;

export const sosFormSchema = z.object({
  contactPhone: z.string().trim().regex(/^01[3-9]\d{8}$/, "phoneFormat"),
  description: z.string().trim().max(500, "sosDescLong"),
});
export type SosFormValues = z.input<typeof sosFormSchema>;

/** Photos: at most five, JPG / PNG / WebP, 5 MB each. */
export const MAX_PHOTOS = 5;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const photoProblem = (f: { type: string; size: number }): "type" | "size" | null => (!PHOTO_TYPES.includes(f.type) ? "type" : f.size > 5 * 1024 * 1024 ? "size" : null);
