"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, ImagePlus, Loader2, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { CROP_SIZE, PHOTO_TYPES, ZOOM_MAX, checkFile, clampOffset, coverScale } from "./logic";
import { cropToJpeg, uploadPrivate } from "./upload";

interface Props { open: boolean; current: string | null; onClose: () => void; onSaved: (avatarUrl: string | null) => void }

/** Pick a photo, drag and zoom it inside a circle, see the live result, "Save Photo" updates it everywhere. */
export function AvatarModal({ open, current, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} labelledBy="avatar-title" busy={busy} maxWidth="max-w-[460px]">
      {open && <Body current={current} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

function Body({ current, onClose, onSaved, setBusy }: { current: string | null; onClose: () => void; onSaved: (u: string | null) => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.profile.avatar");
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const pick = useCallback((f: File | undefined) => {
    if (!f) return;
    const bad = checkFile(f, PHOTO_TYPES, 5);
    if (bad) { setError(t(bad === "type" ? "errors.type" : "errors.size")); return; }
    setError(null); setZoom(1); setOff({ x: 0, y: 0 });
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => { imgRef.current = im; setSize({ w: im.naturalWidth, h: im.naturalHeight }); setSrc(url); };
    im.onerror = () => { URL.revokeObjectURL(url); setError(t("errors.unreadable")); };
    im.src = url;
  }, [t]);

  const scale = size ? coverScale(size.w, size.h, zoom) : 1;
  const move = (x: number, y: number) => size && setOff(clampOffset(size.w, size.h, zoom, x, y));
  useEffect(() => { if (size) setOff((o) => clampOffset(size.w, size.h, zoom, o.x, o.y)); }, [zoom, size]);

  async function save() {
    if (!imgRef.current || !size) return;
    setSaving(true); setError(null);
    try {
      const blob = await cropToJpeg(imgRef.current, zoom, off.x, off.y);
      const key = await uploadPrivate("AVATAR", blob, "image/jpeg");
      const me = await authApi<{ avatarUrl: string | null }>("/me", { method: "PATCH", body: { avatarKey: key } });
      toast("success", t("done"));
      onSaved(me.avatarUrl);
      onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof ApiError && e.code === "NETWORK" ? t("errors.network") : t("errors.generic"));
    }
  }

  return (
    <div>
      <h2 id="avatar-title" className="pr-10 text-xl font-bold text-navy sm:text-2xl">{t("title")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("hint")}</p>

      <div className="mt-5 grid place-items-center">
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
          className={`relative grid place-items-center overflow-hidden rounded-full border-2 border-dashed transition-colors duration-300 ${over ? "border-[#48BDFA] bg-sky-50" : "border-slate-300 bg-slate-100/80"}`}
          style={{ width: CROP_SIZE, height: CROP_SIZE, touchAction: "none" }}
        >
          {src && size ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={t("previewAlt")} draggable={false} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ px: e.clientX, py: e.clientY, ox: off.x, oy: off.y }); }}
              onPointerMove={(e) => drag && move(drag.ox + e.clientX - drag.px, drag.oy + e.clientY - drag.py)} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
              className="absolute left-1/2 top-1/2 max-w-none cursor-grab select-none active:cursor-grabbing"
              style={{ width: size.w * scale, height: size.h * scale, transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` }} />
          ) : current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt={t("currentAlt")} className="size-full object-cover opacity-70" />
          ) : (
            <span className="grid place-items-center gap-1 text-slate-400"><Camera className="size-9" aria-hidden /><span className="text-xs font-semibold">{t("drop")}</span></span>
          )}
        </div>
      </div>

      {src && (
        <label className="mx-auto mt-4 flex max-w-xs items-center gap-3 text-xs font-semibold text-slate-600">
          <ZoomIn className="size-4 shrink-0" aria-hidden /><span className="sr-only">{t("zoom")}</span>
          <input type="range" min={1} max={ZOOM_MAX} step={0.02} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} disabled={saving} className="h-1.5 w-full accent-[#7B2FF7]" />
        </label>
      )}

      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="mt-4 flex justify-center">
        <button type="button" onClick={() => input.current?.click()} disabled={saving} className="btn btn-white h-10 px-4 text-sm"><ImagePlus className="size-4" aria-hidden />{src ? t("another") : t("choose")}</button>
      </div>

      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div>}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
        <button type="button" onClick={() => void save()} disabled={saving || !src} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-44">
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}{saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
