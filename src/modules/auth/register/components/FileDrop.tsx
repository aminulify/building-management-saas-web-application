"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clsx } from "clsx";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Trash2, UploadCloud, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { checkImage } from "../schema";

export type UploadState = "idle" | "uploading" | "done" | "error";

interface Props {
  label: string;
  title: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  state?: UploadState;
  error?: string;
  icon?: LucideIcon;
}

/** Click or drag-and-drop image picker with preview, replace/remove and per-file upload status. */
export function FileDrop({ label, title, hint, file, onChange, state = "idle", error, icon: Icon = UploadCloud }: Props) {
  const id = useId();
  const t = useTranslations("auth.register");
  const v = useTranslations("validation");
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(f: File | undefined) {
    if (!f) return;
    const problem = checkImage(f);
    setLocalError(problem);
    if (!problem) onChange(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  const shownError = localError ? v(localError) : error;

  return (
    <div>
      <p id={`${id}-label`} className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{label}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]); }}
        className={clsx(
          "group relative flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all duration-300",
          over ? "scale-[1.01] border-brand-sky bg-sky-50/80" : "border-slate-300 bg-white/50 hover:border-brand-purple/60 hover:bg-white/80",
          shownError && "border-red-400",
          state === "done" && "border-emerald-400 bg-emerald-50/50",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="peer sr-only"
          aria-labelledby={`${id}-label`}
          aria-describedby={shownError ? `${id}-err` : undefined}
          onChange={(e) => accept(e.target.files?.[0])}
        />
        {file && preview ? (
          <div className="flex w-full flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={title} className="max-h-28 rounded-lg object-contain shadow-sm" />
            <p className="max-w-full truncate text-sm font-medium text-navy">{file.name}</p>
            <div className="flex items-center gap-2 text-xs">
              {state === "uploading" && <span className="inline-flex items-center gap-1 text-brand-purple"><Loader2 className="size-3.5 animate-spin" aria-hidden />{t("uploading")}</span>}
              {state === "done" && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-3.5" aria-hidden />{t("uploaded")}</span>}
              {state === "error" && <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("uploadFailed")}</span>}
              <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-semibold text-label hover:bg-white/80 hover:text-navy">
                <RefreshCw className="size-3.5" aria-hidden />{t("replace")}
              </label>
              <button type="button" onClick={() => { onChange(null); setLocalError(null); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-red-600 hover:bg-red-50">
                <Trash2 className="size-3.5" aria-hidden />{t("remove")}
              </button>
            </div>
          </div>
        ) : (
          <label htmlFor={id} className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 py-4 peer-focus-visible:outline-2">
            <Icon className="mb-1 size-8 text-slate-500 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:text-brand-purple motion-reduce:transition-none" aria-hidden />
            <span className="text-lg font-bold text-navy">{title}</span>
            <span className="text-sm text-slate-400">{hint}</span>
            <span className="mt-1 text-xs text-label">{t("dragHint")}</span>
          </label>
        )}
      </div>
      {shownError && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />{shownError}
        </p>
      )}
    </div>
  );
}
