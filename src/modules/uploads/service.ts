import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/require-actor";

export const BUCKET = "amaderghor-private";
const IMAGE = ["image/jpeg", "image/png", "image/webp"] as const;
const DOC = [...IMAGE, "application/pdf"] as const;
const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4"] as const;
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
  VOICE_MESSAGE: { mimes: AUDIO, max: 5 * MB },
  AGREEMENT: { mimes: DOC, max: 10 * MB },
} as const;
export type UploadPurpose = keyof typeof PURPOSES;

export const signSchema = z.object({
  purpose: z.enum(Object.keys(PURPOSES) as [UploadPurpose, ...UploadPurpose[]]),
  mime: z.string(),
  size: z.coerce.number().int().positive(),
});

export const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a" };
let bucketReady = false;

export async function ensureBucket() {
  if (bucketReady) return;
  const sb = supabaseAdmin();
  const allowed = [...DOC, ...AUDIO];
  const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * MB, allowedMimeTypes: allowed });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new AppError("INTERNAL", { reason: "storage_bucket" });
  // a bucket made before voice messages existed does not list audio yet
  if (error) await sb.storage.updateBucket(BUCKET, { public: false, fileSizeLimit: 10 * MB, allowedMimeTypes: allowed });
  bucketReady = true;
}

/** Key layout `<purpose>/<userId>/<uuid>.<ext>`: the user id in the path is what ownership checks rely on. */
export const PURPOSE_RULES = PURPOSES;
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

/** Recently signed read URLs, so a list page does not ask Supabase again for pictures it just signed. */
const signed = new Map<string, { url: string; exp: number }>();
const fresh = (key: string, seconds: number) => {
  const c = signed.get(key);
  return c && c.exp - Date.now() > Math.max(60, seconds / 2) * 1000 ? c.url : null;
};
const remember = (key: string, url: string, seconds: number) => {
  if (signed.size > 3000) signed.clear();
  signed.set(key, { url, exp: Date.now() + seconds * 1000 });
};

export async function signStorageKey(key: string, seconds = 300) {
  const hit = fresh(key, seconds);
  if (hit) return { url: hit, expiresInSeconds: seconds };
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(key, seconds);
  if (error || !data) throw new AppError("NOT_FOUND");
  remember(key, data.signedUrl, seconds);
  return { url: data.signedUrl, expiresInSeconds: seconds };
}

/** Delete private storage objects (best effort, used when a listing or photo is removed). */
export async function removeStorageKeys(keys: string[]) {
  if (!keys.length) return;
  await supabaseAdmin().storage.from(BUCKET).remove(keys);
  for (const k of keys) signed.delete(k);
}

/** Many keys in ONE request (list pages show 9+ pictures). Keys that cannot be signed are simply missing from the result. */
export async function signStorageKeys(keys: string[], seconds = 300): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const todo: string[] = [];
  for (const k of new Set(keys)) { const hit = fresh(k, seconds); if (hit) out.set(k, hit); else todo.push(k); }
  // one more try for files that could not be signed (a file stored a moment ago, or a storage hiccup)
  for (let attempt = 0; attempt < 2 && todo.some((k) => !out.has(k)); attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 350));
    const { data } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(todo.filter((k) => !out.has(k)), seconds).catch(() => ({ data: null }));
    for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) { out.set(r.path, r.signedUrl); remember(r.path, r.signedUrl, seconds); }
  }
  return out;
}
