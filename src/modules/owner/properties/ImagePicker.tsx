"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Camera, RefreshCw, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { checkPropertyImage } from "./schema";

interface Props {
  file: File | null;
  /** photo already saved on the property (edit mode); hidden once the owner removes or replaces it */
  existingUrl?: string | null;
  onChange: (file: File | null) => void;
  onRemoveExisting?: () => void;
  disabled?: boolean;
}

/** Click or drag a photo in; shows a live preview with replace / remove. PNG, JPG or WebP up to 5 MB. */
export function ImagePicker({ file, existingUrl, onChange, onRemoveExisting, disabled }: Props) {
  const id = useId();
  const t = useTranslations("owner.properties.image");
  const v = useTranslations("validation");
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(f: File | undefined) {
    if (!f) return;
    const p = checkPropertyImage(f);
    setProblem(p);
    if (!p) onChange(f);
    if (input.current) input.current.value = "";
  }

  const shown = preview ?? existingUrl ?? null;

  return (
    <div>
      <p id={`${id}-l`} className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{t("label")}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) accept(e.dataTransfer.files[0]); }}
        className={clsx("group relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300", over ? "scale-[1.01] border-brand-sky bg-sky-50/80" : "border-slate-300 bg-slate-50/70 hover:border-brand-purple/60 hover:bg-white", problem && "border-red-400")}
      >
        <input ref={input} id={id} type="file" accept="image/png,image/jpeg,image/webp" className="peer sr-only" aria-labelledby={`${id}-l`} disabled={disabled} onChange={(e) => accept(e.target.files?.[0])} />
        {shown ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt={t("previewAlt")} className="h-36 w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-slate-900/70 to-transparent p-2 text-xs font-semibold text-white">
              <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-white/20 px-2.5 py-1.5 backdrop-blur-sm transition-colors hover:bg-white/35"><RefreshCw className="size-3.5" aria-hidden />{t("replace")}</label>
              <button type="button" disabled={disabled} onClick={() => { if (file) onChange(null); else onRemoveExisting?.(); setProblem(null); }} className="inline-flex items-center gap-1 rounded-md bg-red-500/80 px-2.5 py-1.5 backdrop-blur-sm transition-colors hover:bg-red-500"><Trash2 className="size-3.5" aria-hidden />{t("remove")}</button>
            </div>
          </div>
        ) : (
          <label htmlFor={id} className="flex cursor-pointer flex-col items-center gap-1 px-4 py-6 text-center peer-focus-visible:outline-2">
            <Camera className="size-8 text-slate-400 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:text-brand-purple motion-reduce:transition-none" aria-hidden />
            <span className="text-sm font-semibold text-navy">{t("title")}</span>
            <span className="text-xs text-slate-500">{t("hint")}</span>
          </label>
        )}
      </div>
      {problem && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5 shrink-0" aria-hidden />{v(problem as never)}</p>}
    </div>
  );
}
