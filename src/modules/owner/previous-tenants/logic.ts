import { z } from "zod";
import type { Behavior, LeaveReason, LedgerStatus } from "./types";

export const BEHAVIORS: Behavior[] = ["EXCELLENT", "GOOD", "AVERAGE", "UGLY", "BAD", "VERY_BAD"];
export const LEAVE_REASONS: LeaveReason[] = ["JOB_TRANSFER", "PURCHASED_HOME", "UPGRADED_UNIT", "LEASE_EXPIRED", "OTHER"];
export const PAGE_SIZE = 10;

/** Colours of the rating badge: Good green, Average blue, Ugly yellow, Very Bad red (design); Excellent deep green, Bad orange. */
export const BEHAVIOR_STYLE: Record<Behavior, string> = {
  EXCELLENT: "bg-emerald-100/90 text-emerald-800 border-emerald-300",
  GOOD: "bg-green-100/90 text-green-700 border-green-300",
  AVERAGE: "bg-sky-100/90 text-sky-700 border-sky-300",
  UGLY: "bg-yellow-100/90 text-yellow-700 border-yellow-300",
  BAD: "bg-orange-100/90 text-orange-700 border-orange-300",
  VERY_BAD: "bg-red-100/90 text-red-700 border-red-300",
};

export const LEDGER_STYLE: Record<LedgerStatus, string> = {
  PAID_ON_TIME: "bg-green-100/90 text-green-700 border-green-300",
  PAID_LATE: "bg-amber-100/90 text-amber-700 border-amber-300",
  DEFAULTED: "bg-red-100/90 text-red-700 border-red-300",
};

/** Years, months and days from move-in to move-out, counting both the first and the last day (2 Nov – 30 Jan = 2 months 29 days). */
export function stayDuration(startIso: string, endIso: string | null): { years: number; months: number; days: number } {
  const a = new Date(startIso);
  const last = endIso ? new Date(endIso) : new Date();
  const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() + 1)); // the day after the last day
  let months = (end.getUTCFullYear() - a.getUTCFullYear()) * 12 + end.getUTCMonth() - a.getUTCMonth();
  let days = end.getUTCDate() - a.getUTCDate();
  if (days < 0) { months -= 1; days += new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).getUTCDate(); }
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12, days: Math.max(0, days) };
}

const date = (required: string) => z.string().min(1, required).regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");

/** Edit form. Error strings are keys under `validation.*`. */
export const editRecordSchema = z
  .object({
    leaveReason: z.enum(["", ...LEAVE_REASONS]),
    behavior: z.enum(["", ...BEHAVIORS]),
    startDate: date("entryDateRequired"),
    endDate: date("leaseDateRequired"),
    ownerNotes: z.string().trim().max(1000, "notesTooLong"),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, { path: ["endDate"], message: "leaseAfterEntry" });
export type EditRecordValues = z.input<typeof editRecordSchema>;

/** The PATCH body: only the fields that changed ("" becomes null so a rating or note can be cleared). */
export function recordPatch(f: EditRecordValues, before: { startDate: string; endDate: string | null; leaveReason: string | null; behavior: string | null; ownerNotes: string | null }) {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const out: Record<string, unknown> = {};
  if (f.startDate !== day(before.startDate)) out.startDate = f.startDate;
  if (f.endDate !== day(before.endDate)) out.endDate = f.endDate;
  if (f.leaveReason !== (before.leaveReason ?? "")) out.leaveReason = f.leaveReason || null;
  if (f.behavior !== (before.behavior ?? "")) out.behavior = f.behavior || null;
  if (f.ownerNotes.trim() !== (before.ownerNotes ?? "")) out.ownerNotes = f.ownerNotes.trim() || null;
  return out;
}

/** The file name of a downloaded statement: tenant-statement-rahim-uddin-2024-01.pdf */
export const statementFileName = (name: string, endIso: string | null) =>
  `tenant-statement-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant"}${endIso ? `-${endIso.slice(0, 7)}` : ""}.pdf`;
