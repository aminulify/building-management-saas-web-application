import { z } from "zod";
import type { DocStatus } from "./types";

/** Pill colours of the Documents card: green verified, yellow pending, red rejected, grey when nothing was uploaded. */
export const DOC_STYLE: Record<DocStatus | "NONE", string> = {
  VERIFIED: "bg-green-500 text-white",
  PENDING: "bg-yellow-400 text-yellow-950",
  REJECTED: "bg-red-600 text-white",
  NONE: "bg-slate-300 text-slate-700",
};
export const DOC_ROW: Record<DocStatus | "NONE", string> = {
  VERIFIED: "bg-green-100/90 border-green-200",
  PENDING: "bg-yellow-100/90 border-yellow-200",
  REJECTED: "bg-red-100/90 border-red-200",
  NONE: "bg-slate-100/90 border-slate-200",
};

/* ---------- circular photo crop ---------- */
export const CROP_SIZE = 256;
export const OUT_SIZE = 512;
export const ZOOM_MAX = 3;

/** The image is first scaled to cover the circle, then by `zoom`. */
export const coverScale = (w: number, h: number, zoom: number, d = CROP_SIZE) => (d / Math.min(w, h)) * zoom;

/** Keep the picture covering the whole circle: no empty edge can be dragged into view. */
export function clampOffset(w: number, h: number, zoom: number, ox: number, oy: number, d = CROP_SIZE) {
  const s = coverScale(w, h, zoom, d);
  const mx = Math.max(0, (w * s - d) / 2), my = Math.max(0, (h * s - d) / 2);
  return { x: Math.min(mx, Math.max(-mx, ox)) + 0, y: Math.min(my, Math.max(-my, oy)) + 0 };
}

/** The part of the original image that lies inside the circle (what is saved). */
export function sourceRect(w: number, h: number, zoom: number, ox: number, oy: number, d = CROP_SIZE) {
  const s = coverScale(w, h, zoom, d);
  const c = clampOffset(w, h, zoom, ox, oy, d);
  return { sx: (w * s / 2 - d / 2 - c.x) / s, sy: (h * s / 2 - d / 2 - c.y) / s, size: d / s };
}

/** Occupied / vacant shares for the unit donut. */
export function donut(total: number, occupied: number) {
  const occ = Math.max(0, Math.min(occupied, total));
  const frac = total > 0 ? occ / total : 0;
  return { occupied: occ, vacant: Math.max(0, total - occ), frac, percent: Math.round(frac * 100) };
}

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DOC_TYPES = [...PHOTO_TYPES, "application/pdf"];

/** null = fine, otherwise the translation key of the problem. */
export function checkFile(f: { type: string; size: number }, types: string[], maxMb: number): "type" | "size" | null {
  if (!types.includes(f.type)) return "type";
  if (f.size > maxMb * 1024 * 1024) return "size";
  return null;
}

/** "15 AUG 1990" / "১৫ আগস্ট ১৯৯০" */
export function formatDob(locale: string, iso: string | null): string {
  if (!iso) return "—";
  const s = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
  return locale === "bn" ? s : s.replace(/\./g, "").toUpperCase();
}

const date = (required: string) => z.string().min(1, required).regex(/^\d{4}-\d{2}-\d{2}$/, "dateInvalid");
const text = (min: number, max: number, key: string) => z.string().trim().min(min, key).max(max, key);

/** Update Profile form. Error strings are keys under `validation.*`. */
export const profileFormSchema = z.object({
  fullName: text(2, 100, "nameLength"),
  phone: z.string().trim().regex(/^01[3-9]\d{8}$/, "phoneFormat"),
  occupation: z.string().trim().max(80, "occupationLong"),
  dateOfBirth: date("dobRequired").refine((v) => v <= new Date().toISOString().slice(0, 10), "dobFuture"),
  division: text(2, 60, "divisionRequired"),
  district: text(2, 60, "districtRequired"),
  upazila: z.string().trim().max(60, "tooLong"),
  union: z.string().trim().max(80, "tooLong"),
  street: z.string().trim().max(200, "tooLong"),
  postOffice: z.string().trim().max(80, "tooLong"),
});
export type ProfileFormValues = z.input<typeof profileFormSchema>;

/** Only what changed: the address goes as one block (the server keeps what is missing). */
export function profilePatch(f: ProfileFormValues, before: { fullName: string; phone: string | null; occupation: string | null; dateOfBirth: string | null; address: Record<string, string | null> | null }) {
  const out: Record<string, unknown> = {};
  if (f.fullName.trim() !== before.fullName) out.fullName = f.fullName.trim();
  if (f.phone.trim() !== (before.phone ?? "")) out.phone = f.phone.trim();
  if (f.occupation.trim() !== (before.occupation ?? "")) out.occupation = f.occupation.trim();
  if (f.dateOfBirth !== (before.dateOfBirth ?? "").slice(0, 10)) out.dateOfBirth = f.dateOfBirth;
  const a = before.address ?? {};
  const keys = ["division", "district", "upazila", "union", "street", "postOffice"] as const;
  if (keys.some((k) => f[k].trim() !== (a[k] ?? ""))) {
    out.address = { division: f.division.trim(), district: f.district.trim(), ...Object.fromEntries(keys.slice(2).filter((k) => f[k].trim()).map((k) => [k, f[k].trim()])) };
  }
  return out;
}
