import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase";
import { BUCKET, EXT, PURPOSE_RULES, ensureBucket } from "@/modules/uploads/service";
import type { regUploadSchema } from "./schema";

const PURPOSES = ["NID_FRONT", "NID_BACK", "AVATAR"] as const;

/**
 * The sign-up wizard uploads documents BEFORE the account exists (and before the e-mail is confirmed), so it cannot
 * send a bearer token. Files go to a private `REG/<session>/` folder; the session id is an unguessable uuid held only by
 * the browser, uploads are rate-limited per IP, and register() moves the files to the user's own folder.
 */
export async function signRegistrationUpload(input: z.infer<typeof regUploadSchema>, req: Request) {
  rateLimit(`reg-upload:${clientIp(req)}`, 15, 3600_000);
  const rule = PURPOSE_RULES[input.purpose];
  if (!(rule.mimes as readonly string[]).includes(input.mime)) throw new AppError("VALIDATION_ERROR", [{ path: "mime", code: "unsupported_type", allowed: rule.mimes }]);
  if (input.size > rule.max) throw new AppError("VALIDATION_ERROR", [{ path: "size", code: "too_large", maxBytes: rule.max }]);
  await ensureBucket();
  const key = `REG/${input.session}/${input.purpose}.${EXT[input.mime]}`;
  const sb = supabaseAdmin().storage.from(BUCKET);
  await sb.remove([key]); // re-picking a file replaces the previous one
  const { data, error } = await sb.createSignedUploadUrl(key);
  if (error || !data) throw new AppError("INTERNAL", { reason: "storage_sign" });
  return { key, signedUrl: data.signedUrl, token: data.token, expiresInSeconds: 7200 };
}

/** Moves the session's files to the new user and queues the account for manual NID review. Never throws: the account already exists. */
export async function finalizeRegistrationUploads(userId: string, session: string) {
  const result = { nidFront: false, nidBack: false, avatar: false };
  try {
    const sb = supabaseAdmin().storage.from(BUCKET);
    const { data: files } = await sb.list(`REG/${session}`);
    for (const purpose of PURPOSES) {
      const f = files?.find((x) => x.name.startsWith(purpose + "."));
      if (!f) continue;
      const to = `${purpose}/${userId}/${randomUUID()}.${f.name.split(".").pop()}`;
      const { error } = await sb.move(`REG/${session}/${f.name}`, to);
      if (error) continue;
      if (purpose === "AVATAR") {
        await db.user.update({ where: { id: userId }, data: { avatarKey: to } });
        result.avatar = true;
      } else {
        await db.verificationDocument.create({ data: { ownerType: "USER", ownerId: userId, kind: purpose, storageKey: to } });
        if (purpose === "NID_FRONT") result.nidFront = true; else result.nidBack = true;
      }
    }
    if (result.nidFront && result.nidBack) await db.user.update({ where: { id: userId }, data: { verificationStatus: "PENDING" } });
  } catch (e) {
    console.error("finalizeRegistrationUploads", e);
  }
  return result;
}

/**
 * A sign-up that never completes (e-mail quota hit, tab closed, validation error) leaves NID photos in REG/.
 * Daily job: delete every session folder whose newest file is older than `maxAgeMs` (default 24 h).
 */
export async function purgeStaleRegistrationUploads(maxAgeMs = 24 * 3600_000) {
  const sb = supabaseAdmin().storage.from(BUCKET);
  const { data: folders } = await sb.list("REG", { limit: 1000 });
  let removedFiles = 0;
  let removedSessions = 0;
  for (const f of folders ?? []) {
    const { data: files } = await sb.list(`REG/${f.name}`);
    if (!files?.length) continue;
    const newest = Math.max(...files.map((x) => new Date(x.created_at ?? x.updated_at ?? 0).getTime()));
    if (Date.now() - newest < maxAgeMs) continue;
    const { error } = await sb.remove(files.map((x) => `REG/${f.name}/${x.name}`));
    if (!error) { removedFiles += files.length; removedSessions++; }
  }
  return { removedSessions, removedFiles };
}
