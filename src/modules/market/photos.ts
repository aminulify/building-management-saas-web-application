import { authApi } from "@/lib/auth-client";
import { MAX_PHOTO_MB, PHOTO_TYPES } from "./sell-form";

/** null = fine, otherwise the translation key of the problem */
export function checkPhoto(f: File): "photoType" | "photoSize" | null {
  if (!PHOTO_TYPES.includes(f.type)) return "photoType";
  if (f.size > MAX_PHOTO_MB * 1024 * 1024) return "photoSize";
  return null;
}

interface Signed { key: string; signedUrl: string }

/** 1) signed upload URL from our API, 2) PUT the file to private storage, 3) attach it to the listing at `order`. */
export async function uploadListingPhoto(listingId: string, file: File, order: number): Promise<void> {
  const signed = await authApi<Signed>("/uploads/sign", { method: "POST", body: { purpose: "LISTING_IMAGE", mime: file.type, size: file.size } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file); // storage expects the file under an empty field name
  const res = await fetch(signed.signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
  await authApi(`/listings/${listingId}/images`, { method: "POST", body: { storageKey: signed.key, order } });
}
