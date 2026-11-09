import { api } from "@/lib/api-client";

export type RegUploadPurpose = "NID_FRONT" | "NID_BACK" | "AVATAR";

interface Signed { key: string; signedUrl: string; token: string }

/**
 * Sign-up documents go to a private folder before the account exists:
 * 1) ask our API for a signed upload URL, 2) PUT the file straight to private storage.
 * The server moves them to the new user when the account is created.
 */
export async function uploadRegistrationFile(session: string, purpose: RegUploadPurpose, file: File): Promise<void> {
  const signed = await api<Signed>("/auth/register/uploads", { method: "POST", body: { session, purpose, mime: file.type, size: file.size } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file); // storage expects the file under an empty field name
  const res = await fetch(signed.signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
}
