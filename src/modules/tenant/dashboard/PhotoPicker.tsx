"use client";

import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_PHOTOS, photoProblem } from "./logic";

interface Props { files: File[]; onChange: (f: File[]) => void; onProblem: (key: "type" | "size" | "many") => void; disabled?: boolean; label: string }

/** Up to five photos with small previews; they are uploaded when the form is sent. */
export function PhotoPicker({ files, onChange, onProblem, disabled, label }: Props) {
  const t = useTranslations("tenant.dashboard.photos");
  const input = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const bad = photoProblem(f);
      if (bad) { onProblem(bad); continue; }
      if (next.length >= MAX_PHOTOS) { onProblem("many"); break; }
      next.push(f);
    }
    onChange(next);
  }

  return (
    <div>
      <p className="mb-2 block text-xs font-bold uppercase tracking-wider text-label">{label}</p>
      <div className="flex flex-wrap gap-2.5">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="relative size-16 overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[i]} alt={f.name} className="size-full object-cover" />
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} disabled={disabled} aria-label={t("remove", { name: f.name })} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-slate-900/70 text-white"><X className="size-3" aria-hidden /></button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button type="button" onClick={() => input.current?.click()} disabled={disabled} className="grid size-16 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-[#48BDFA] hover:text-[#0A84F0]" aria-label={t("add")}><ImagePlus className="size-6" aria-hidden /></button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <p className="mt-1.5 text-xs text-label">{t("hint", { n: MAX_PHOTOS })}</p>
    </div>
  );
}
