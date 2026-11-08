import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";

const BUCKET = "amaderghor-private";
const IMAGE = ["image/jpeg", "image/png", "image/webp"] as const;
const DOC = [...IMAGE, "application/pdf"] as const;
const MB = 1024 * 1024;

/** What may be uploaded for which purpose (architecture 11.1: images 5 MB, docs 10 MB, messages 10 MB). */
const PURPOSES = {
  AVATAR: { mimes: IMAGE, max: 5 * MB },
  NID_FRONT: { mimes: DOC, max: 10 * MB },
  NID_BACK: { mimes: DOC, max: 10 * MB },
  VERIFICATION_DOC: { mimes: DOC, max: 10 * MB },
  PROPERTY_IMAGE: { mimes: IMAGE, max: 5 * MB },
  PROPERTY_DOC: { mimes: DOC, max: 10 * MB },
  LISTING_IMAGE: { mimes: IMAGE, max: 5 * MB },
  LISTING_DOC: { mimes: DOC, max: 10 * MB },
  MAINTENANCE_IMAGE: { mimes: IMAGE, max: 5 * MB },
  COMPLAINT_EVIDENCE: { mimes: DOC, max: 10 * MB },
  REPORT_EVIDENCE: { mimes: DOC, max: 10 * MB },
  MESSAGE_ATTACHMENT: { mimes: DOC, max: 10 * MB },
  AGREEMENT: { mimes: DOC, max: 10 * MB },
} as const;
export type UploadPurpose = keyof typeof PURPOSES;

export const signSchema = z.object({
  purpose: z.enum(Object.keys(PURPOSES) as [UploadPurpose, ...UploadPurpose[]]),
  mime: z.string(),
  size: z.coerce.number().int().positive(),
});

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const sb = supabaseAdmin();
  const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * MB, allowedMimeTypes: [...DOC] });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new AppError("INTERNAL", { reason: "storage_bucket" });
  bucketReady = true;
}

/** Key layout `<purpose>/<userId>/<uuid>.<ext>`: the user id in the path is what ownership checks rely on. */
export const keyBelongsTo = (key: string, userId: string) => key.split("/")[1] === userId;
export const keyPurpose = (key: string) => key.split("/")[0] as UploadPurpose;

export async function signUpload(actor: Actor, input: z.infer<typeof signSchema>) {
  rateLimit(`upload:${actor.id}`, 60, 3600_000);
  const rule = PURPOSES[input.purpose];
  if (!(rule.mimes as readonly string[]).includes(input.mime)) throw new AppError("VALIDATION_ERROR", [{ path: "mime", code: "unsupported_type", allowed: rule.mimes }]);
  if (input.size > rule.max) throw new AppError("VALIDATION_ERROR", [{ path: "size", code: "too_large", maxBytes: rule.max }]);
  if (input.purpose === "AGREEMENT" && actor.role !== "OWNER") throw new AppError("FORBIDDEN");

  await ensureBucket();
  const key = `${input.purpose}/${actor.id}/${randomUUID()}.${EXT[input.mime]}`;
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(key);
  if (error || !data) throw new AppError("INTERNAL", { reason: "storage_sign" });
  return { bucket: BUCKET, key, signedUrl: data.signedUrl, token: data.token, expiresInSeconds: 7200 };
}

/** 5-minute read URL. Allowed for the uploader and Super Admin only; other modules sign for parties they authorise themselves. */
export async function signRead(actor: Actor, key: string) {
  if (!keyBelongsTo(key, actor.id) && actor.role !== "SUPER_ADMIN") throw new AppError("FORBIDDEN");
  return signStorageKey(key);
}

export async function signStorageKey(key: string) {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(key, 300);
  if (error || !data) throw new AppError("NOT_FOUND");
  return { url: data.signedUrl, expiresInSeconds: 300 };
}
