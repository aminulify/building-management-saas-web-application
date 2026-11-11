import { authApi } from "@/lib/auth-client";

interface Signed { key: string; signedUrl: string }

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 6;

/** Photo of a property: 1) signed upload URL from our API, 2) PUT the file to private storage, 3) attach it to the property. */
export async function uploadPropertyPhoto(propertyId: string, file: File): Promise<void> {
  const signed = await authApi<Signed>("/uploads/sign", { method: "POST", body: { purpose: "PROPERTY_IMAGE", mime: file.type, size: file.size } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file); // storage expects the file under an empty field name
  const res = await fetch(signed.signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
  await authApi(`/admin/properties/${propertyId}/images`, { method: "POST", body: { storageKey: signed.key } });
}
