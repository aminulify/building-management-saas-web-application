import { z } from "zod";
import { PUBLIC_REGISTRATION_ROLES } from "@/shared/roles";
import { bdPhoneSchema, nidSchema, usernameSchema } from "@/modules/users/schema";

export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, "password_letter")
  .regex(/\d/, "password_digit");

const registerAddress = z.object({
  division: z.string().trim().min(2).max(60), district: z.string().trim().min(2).max(60),
  upazila: z.string().trim().max(60).optional(), area: z.string().trim().max(100).optional(),
  union: z.string().trim().max(80).optional(), postOffice: z.string().trim().max(80).optional(),
  street: z.string().trim().max(200).optional(), postalCode: z.string().regex(/^\d{4}$/).optional(),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email(),
  phone: bdPhoneSchema,
  password: passwordSchema,
  role: z.enum(PUBLIC_REGISTRATION_ROLES),
  nid: nidSchema.optional(),
  occupation: z.string().trim().max(80).optional(),
  /** random uuid chosen by the browser; ties pre-registration uploads (NID, photo) to this sign-up */
  uploadSession: z.string().uuid().optional(),
  dateOfBirth: z.coerce.date().max(new Date()).optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  address: registerAddress.optional(),
  locale: z.enum(["bn", "en"]).default("bn"),
  consent: z.literal(true),
});

export const loginSchema = z.object({
  /** email or Bangladesh phone number */
  identifier: z.string().trim().toLowerCase().min(3).max(120),
  password: z.string().min(1).max(72),
});

export const otpSendSchema = z.object({ identifier: z.string().trim().toLowerCase().min(3).max(120) });
export const otpVerifySchema = z.object({
  identifier: z.string().trim().toLowerCase().min(3).max(120),
  token: z.string().regex(/^\d{4,8}$/),
});
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ password: passwordSchema });

export const adminCreateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email(),
  phone: bdPhoneSchema,
  password: passwordSchema,
  role: z.enum(["GOV_ADMIN", "SUPER_ADMIN"]),
  department: z.string().trim().max(100).optional(),
  designation: z.string().trim().max(100).optional(),
});

export const adminUsersQuery = z.object({
  role: z.enum(["SUPER_ADMIN", "GOV_ADMIN", "OWNER", "TENANT", "GENERAL_USER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED", "INACTIVE"]).optional(),
  q: z.string().trim().max(60).optional(),
});

export const suspendSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  status: z.enum(["SUSPENDED", "BANNED"]).default("SUSPENDED"),
});

export const roleChangeSchema = z.object({ role: z.enum(["GOV_ADMIN", "SUPER_ADMIN", "OWNER", "TENANT", "GENERAL_USER"]) });

export const isEmail = (v: string) => v.includes("@");

export const verifyUserSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  notes: z.string().trim().max(300).optional(),
}).refine((v) => v.status !== "REJECTED" || !!v.notes, { message: "reason_required", path: ["notes"] });

export const userEditSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: bdPhoneSchema,
  locale: z.enum(["bn", "en"]),
}).partial().strict().refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const availabilityQuery = z.object({
  username: usernameSchema.optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: bdPhoneSchema.optional(),
}).refine((v) => v.username || v.email || v.phone, { message: "one_field_required", path: ["username"] });

export const regUploadSchema = z.object({
  session: z.string().uuid(),
  purpose: z.enum(["NID_FRONT", "NID_BACK", "AVATAR"]),
  mime: z.string(),
  size: z.coerce.number().int().positive(),
});
