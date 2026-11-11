import { authApi } from "@/lib/auth-client";
import { OUT_SIZE, sourceRect } from "./logic";

interface Signed { key: string; signedUrl: string }

/** 1) signed upload URL from our API, 2) PUT the file to private storage. Returns the storage key. */
export async function uploadPrivate(purpose: "AVATAR" | "NID_FRONT" | "NID_BACK" | "AGREEMENT" | "VERIFICATION_DOC" | "MAINTENANCE_IMAGE" | "COMPLAINT_EVIDENCE", file: Blob, mime: string): Promise<string> {
  const signed = await authApi<Signed>("/uploads/sign", { method: "POST", body: { purpose, mime, size: file.size } });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([file], { type: mime })); // storage expects the file under an empty field name
  const res = await fetch(signed.signedUrl, { method: "PUT", body: form, headers: { "x-upsert": "false" } });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
  return signed.key;
}

/** Draws the part of the picture inside the circle as a square JPEG (the app shows it in a circle). */
export async function cropToJpeg(img: HTMLImageElement, zoom: number, ox: number, oy: number): Promise<Blob> {
  const { sx, sy, size } = sourceRect(img.naturalWidth, img.naturalHeight, zoom, ox, oy);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, size, size, 0, 0, OUT_SIZE, OUT_SIZE);
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("crop_failed"))), "image/jpeg", 0.9));
}
