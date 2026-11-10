"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { checkPhoto } from "./photos";
import { MAX_PHOTOS, MAX_PHOTO_MB } from "./sell-form";

interface Props {
  /** photos already saved on the listing (edit) */
  existing: { id: string; url: string }[];
  files: File[];
  onFiles: (files: File[]) => void;
  onRemoveExisting: (id: string) => void;
  error?: string;
  disabled?: boolean;
}

/** Add up to 10 photos by click or drag; the first one is the cover. Existing photos can be removed too. */
export function PhotoGrid({ existing, files, onFiles, onRemoveExisting, error, disabled }: Props) {
  const t = useTranslations("owner.marketplace.sell");
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const total = existing.length + files.length;

  function add(list: FileList | File[] | null) {
    if (!list) return;
    const next = [...files];
    let bad: string | null = null;
    for (const f of Array.from(list)) {
      const p = checkPhoto(f);
      if (p) { bad = p; continue; }
      if (existing.length + next.length >= MAX_PHOTOS) { bad = "photoMax"; break; }
      next.push(f);
    }
    setProblem(bad);
    onFiles(next);
    if (input.current) input.current.value = "";
  }

  const tile = "group relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200";
  const del = "absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90 text-red-600 shadow transition-all hover:scale-105 disabled:opacity-50";

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {existing.map((p, i) => (
          <div key={p.id} className={tile}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img src={p.url} alt={t("photoAlt", { n: i + 1 })} className="size-full object-cover" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-gradient px-2 py-0.5 text-[0.65rem] font-bold text-white">{t("cover")}</span>}
            <button type="button" disabled={disabled} onClick={() => onRemoveExisting(p.id)} aria-label={t("removePhoto")} className={del}><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
        {urls.map((u, i) => (
          <div key={u} className={tile}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={u} alt={t("photoAlt", { n: existing.length + i + 1 })} className="size-full object-cover" />
            {existing.length + i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-gradient px-2 py-0.5 text-[0.65rem] font-bold text-white">{t("cover")}</span>}
            <button type="button" disabled={disabled} onClick={() => onFiles(files.filter((_, k) => k !== i))} aria-label={t("removePhoto")} className={del}><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
        {total < MAX_PHOTOS && (
          <button
            type="button" disabled={disabled} onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
            className={clsx("flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-sm font-semibold transition-all duration-300", over ? "border-[#48BDFA] bg-sky-50 text-[#0A84F0]" : "border-slate-300 bg-white/60 text-slate-500 hover:border-[#48BDFA] hover:text-[#0A84F0]")}
          >
            <ImagePlus className="size-6" aria-hidden />{t("addPhotos")}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} data-testid="photo-input" />
      <p className="mt-1.5 text-xs text-label">{t("photoHint", { max: MAX_PHOTOS, mb: MAX_PHOTO_MB, count: total })}</p>
      {(problem || error) && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{t(`errors.${problem ?? error}`)}</p>}
    </div>
  );
}
