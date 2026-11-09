import { z } from "zod";

/** Error strings are keys under `validation.*` in messages/{bn,en}.json. Rules mirror the backend Zod schemas. */
export const ACCOUNT_ROLES = ["OWNER", "TENANT", "GENERAL_USER"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** 017XXXXXXXX, +88017XXXXXXXX, 88017XXXXXXXX, with or without spaces/dashes → 017XXXXXXXX */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s\-()]/g, "");
  return d.replace(/^\+?88(?=01)/, "");
}

const today = () => new Date().toISOString().slice(0, 10);

export const personalSchema = z.object({
  role: z.enum(ACCOUNT_ROLES, "roleRequired"),
  fullName: z.string().trim().min(2, "fullNameMin").max(100, "fullNameMax"),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, "usernameFormat"),
  email: z.string().trim().toLowerCase().email("emailInvalid"),
  phone: z.string().trim().refine((v) => /^01[3-9]\d{8}$/.test(normalizePhone(v)), "phoneInvalid"),
  occupation: z.string().trim().max(80, "occupationMax"),
  dateOfBirth: z.string().min(1, "dobRequired").refine((v) => v >= "1900-01-01" && v <= today(), "dobInvalid"),
  nid: z.string().trim().regex(/^\d{13,17}$/, "nidFormat"),
});

export const addressSchema = z.object({
  division: z.string().min(1, "divisionRequired"),
  district: z.string().min(1, "districtRequired"),
  upazila: z.string().trim().min(2, "upazilaRequired").max(80),
  union: z.string().trim().max(80, "tooLong"),
  street: z.string().trim().min(3, "streetRequired").max(200, "tooLong"),
  postOffice: z.string().trim().max(80, "tooLong"),
});

export const securitySchema = z
  .object({
    password: z.string().min(8, "passwordMin").max(72, "passwordMax").regex(/[A-Za-z]/, "passwordLetter").regex(/\d/, "passwordDigit"),
    confirmPassword: z.string().min(1, "confirmRequired"),
  })
  .superRefine((v, ctx) => {
    if (v.confirmPassword && v.password !== v.confirmPassword) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "passwordMismatch" });
  });

export const consentSchema = z.object({ consent: z.literal(true, "consentRequired") });

export const registerFormSchema = z.object({
  ...personalSchema.shape,
  ...addressSchema.shape,
  password: securitySchema.shape.password,
  confirmPassword: securitySchema.shape.confirmPassword,
  consent: z.boolean().refine((v) => v === true, "consentRequired"),
}).superRefine((v, ctx) => {
  if (v.confirmPassword && v.password !== v.confirmPassword) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "passwordMismatch" });
});

export type RegisterFormValues = z.input<typeof registerFormSchema>;

/** Which form fields belong to which wizard step (used for per-step validation and for jumping to a server error). */
export const STEP_FIELDS: Record<1 | 2 | 3 | 4, (keyof RegisterFormValues)[]> = {
  1: ["role", "fullName", "username", "email", "phone", "occupation", "dateOfBirth", "nid"],
  2: ["division", "district", "upazila", "union", "street", "postOffice"],
  3: ["password", "confirmPassword"],
  4: ["consent"],
};

export const stepOfField = (name: string): 1 | 2 | 3 | 4 => {
  const f = name.replace(/^address\./, "");
  for (const s of [1, 2, 3, 4] as const) if ((STEP_FIELDS[s] as string[]).includes(f)) return s;
  return 1;
};

/* ---------- documents ---------- */
export const DOC_MAX_BYTES = 5 * 1024 * 1024;
export const DOC_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** returns a `validation.*` key, or null when the file is fine */
export function checkImage(file: File): string | null {
  if (!(DOC_TYPES as readonly string[]).includes(file.type)) return "fileType";
  if (file.size > DOC_MAX_BYTES) return "fileSize";
  if (file.size === 0) return "fileEmpty";
  return null;
}

export function passwordScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
  return s as 0 | 1 | 2 | 3 | 4;
}
