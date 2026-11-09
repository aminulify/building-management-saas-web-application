"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { checkImage, type RegisterFormValues } from "../schema";
import { FileDrop, type UploadState } from "./FileDrop";
import { useFieldError } from "./useFieldError";

export interface Docs { nidFront: File | null; nidBack: File | null; photo: File | null }
export type DocStates = Record<keyof Docs, UploadState>;
export type DocErrors = Partial<Record<keyof Docs, string>>;

interface Props {
  docs: Docs;
  onDocs: (next: Partial<Docs>) => void;
  states: DocStates;
  errors: DocErrors;
}

function PhotoPicker({ file, onChange, state }: { file: File | null; onChange: (f: File | null) => void; state: UploadState }) {
  const id = useId();
  const t = useTranslations("auth.register");
  const v = useTranslations("validation");
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="rounded-xl border border-sky-300 bg-[#F0F9FF]/90 p-4 transition-shadow duration-300 hover:shadow-[0_8px_24px_-12px_rgba(0,174,239,0.5)] sm:p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
        <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-sky-100 bg-white text-brand-sky shadow-inner sm:size-24">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt={t("photo.title")} className="size-full object-cover" /> : <Camera className="size-8" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-lg font-bold text-navy">{t("photo.title")}</p>
          <p className="text-sm text-slate-400">{t("photo.hint")}</p>
          {file && <p className="mt-1 truncate text-xs font-medium text-label">{file.name}</p>}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <input
              ref={ref} id={id} type="file" accept="image/png,image/jpeg,image/webp" className="peer sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const bad = checkImage(f);
                setProblem(bad);
                if (!bad) onChange(f);
                e.target.value = "";
              }}
            />
            <label htmlFor={id} className="cursor-pointer rounded-md border border-sky-500 bg-sky-100/70 px-3 py-1 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-200/70 peer-focus-visible:outline-2 peer-focus-visible:outline-brand-sky">
              {t("photo.choose")}
            </label>
            {file && (
              <button type="button" onClick={() => { onChange(null); setProblem(null); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                <Trash2 className="size-3.5" aria-hidden />{t("remove")}
              </button>
            )}
            {state === "uploading" && <span className="inline-flex items-center gap-1 text-xs text-brand-purple"><Loader2 className="size-3.5 animate-spin" aria-hidden />{t("uploading")}</span>}
            {state === "done" && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="size-3.5" aria-hidden />{t("uploaded")}</span>}
            {state === "error" && <span className="inline-flex items-center gap-1 text-xs text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("uploadFailed")}</span>}
          </div>
          {problem && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{v(problem)}</p>}
        </div>
      </div>
    </div>
  );
}

export function StepDocuments({ docs, onDocs, states, errors }: Props) {
  const t = useTranslations("auth.register");
  const { register } = useFormContext<RegisterFormValues>();
  const err = useFieldError<RegisterFormValues>();

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FileDrop label={t("docs.frontLabel")} title={t("docs.frontTitle")} hint={t("docs.hint")} file={docs.nidFront} onChange={(f) => onDocs({ nidFront: f })} state={states.nidFront} error={errors.nidFront} />
        <FileDrop label={t("docs.backLabel")} title={t("docs.backTitle")} hint={t("docs.hint")} file={docs.nidBack} onChange={(f) => onDocs({ nidBack: f })} state={states.nidBack} error={errors.nidBack} />
      </div>

      <PhotoPicker file={docs.photo} onChange={(f) => onDocs({ photo: f })} state={states.photo} />

      <div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm text-navy transition-colors hover:bg-white/60">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-purple" {...register("consent")} />
          <span>
            <span className="inline-flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-4 text-emerald-600" aria-hidden />{t("consent.title")}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-label">{t("consent.text")}</span>
          </span>
        </label>
        {err("consent") && <p role="alert" className="mt-1 text-xs font-medium text-red-600">{err("consent")}</p>}
      </div>
    </div>
  );
}
