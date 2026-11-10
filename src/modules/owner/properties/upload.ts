import { authApi } from "@/lib/auth-client";

interface Signed { key: string; signedUrl: string }

/** Property photo: 1) signed upload URL from our API, 2) PUT the file to private storage, 3) attach it as the cover (order 0). */
export async function uploadPropertyImage(propertyId: string, file: File): Promise<void> {
  const signed = await authApi<Signed>("/uploads/sign", { method: "POST", body: { purpose: "PROPERTY_IMAGE", mime: file.type, size: file.size } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file); // storage expects the file under an empty field name
  const res = await fetch(signed.signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
  await authApi(`/properties/${propertyId}/images`, { method: "POST", body: { storageKey: signed.key, order: 0 } });
}
