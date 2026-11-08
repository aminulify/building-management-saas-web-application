import { z } from "zod";

/** Registration fields reused by the auth module (M05) – defined here so DB rules live in one place. */
export const usernameSchema = z.string().regex(/^[a-z0-9]{3,20}$/, "username_format");
export const bdPhoneSchema = z.string().regex(/^01[3-9]\d{8}$/, "bd_phone");
export const nidSchema = z.string().regex(/^\d{10}$|^\d{13}$|^\d{17}$/, "nid_format");

export const meUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    phone: bdPhoneSchema,
    locale: z.enum(["bn", "en"]),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]),
    dateOfBirth: z.coerce.date().max(new Date()),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
