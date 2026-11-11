"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, FileCheck2, Loader2, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { DOC_TYPES, checkFile } from "./logic";
import { uploadPrivate } from "./upload";
import type { DocKind, DocState } from "./types";

interface Props { kind: DocKind | null; state: DocState | null; onClose: () => void; onSaved: () => void }

/** NID front / back: drag and drop, choose a file, or use the phone camera. After sending, the review status is PENDING. */
export function DocumentModal({ kind, state, onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={kind !== null} onClose={onClose} labelledBy="doc-title" busy={busy} maxWidth="max-w-[480px]">
      {kind && <Body kind={kind} state={state} onClose={onClose} onSaved={onSaved} setBusy={setBusy} />}
    </Modal>
  );
}

function Body({ kind, state, onClose, onSaved, setBusy }: { kind: DocKind; state: DocState | null; onClose: () => void; onSaved: () => void; setBusy: (b: boolean) => void }) {
  const t = useTranslations("owner.profile.doc");
  const toast = useToast();
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setBusy(saving); }, [saving, setBusy]);
  useEffect(() => { if (!file || !file.type.startsWith("image/")) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const verified = state?.status === "VERIFIED";

  function pick(f: File | undefined) {
    if (!f) return;
    const bad = checkFile(f, DOC_TYPES, 10);
    if (bad) { setError(t(bad === "type" ? "errors.type" : "errors.size")); return; }
    setError(null); setFile(f);
  }
  async function send() {
    if (!file) return;
    setSaving(true); setError(null);
    try {
      const key = await uploadPrivate(kind, file, file.type);
      await authApi("/me/documents", { method: "POST", body: { kind, storageKey: key } });
      toast("success", t("done"));
      onSaved(); onClose();
    } catch (e) {
      setSaving(false);
      setError(e instanceof ApiError && e.code === "NETWORK" ? t("errors.network") : e instanceof ApiError && e.code === "RATE_LIMITED" ? t("errors.rate") : t("errors.generic"));
    }
  }

  return (
    <div>
      <h2 id="doc-title" className="pr-10 text-xl font-bold text-navy sm:text-2xl">{t(kind === "NID_FRONT" ? "titleFront" : "titleBack")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("hint")}</p>
      {state?.status === "REJECTED" && <p role="status" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{t("rejected")}{state.notes ? ` ${state.notes}` : ""}</p>}
      {verified && <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800"><FileCheck2 className="size-4 shrink-0" aria-hidden />{t("verified")}</p>}

      {!verified && (
        <>
          <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
            className={`mt-4 grid min-h-44 place-items-center rounded-2xl border-2 border-dashed p-4 text-center transition-colors duration-300 ${over ? "border-[#48BDFA] bg-sky-50" : "border-slate-300 bg-white/60"}`}>
            {file ? (
              <div className="flex flex-col items-center gap-2">
                {preview ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt={t("previewAlt")} className="max-h-40 rounded-lg object-contain" /> : <FileCheck2 className="size-10 text-sky-500" aria-hidden />}
                <p className="max-w-full truncate text-sm font-semibold text-navy">{file.name}</p>
                <p className="text-xs text-label">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500"><UploadCloud className="size-10" aria-hidden /><p className="text-sm font-semibold text-navy">{t("drop")}</p><p className="text-xs">{t("types")}</p></div>
            )}
          </div>
          <input ref={files} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <button type="button" onClick={() => files.current?.click()} disabled={saving} className="btn btn-white h-11 text-sm"><UploadCloud className="size-4" aria-hidden />{t("choose")}</button>
            <button type="button" onClick={() => camera.current?.click()} disabled={saving} className="btn btn-white h-11 text-sm"><Camera className="size-4" aria-hidden />{t("camera")}</button>
          </div>
        </>
      )}

      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div>}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={onClose} disabled={saving} className="btn btn-white h-12 sm:min-w-32">{verified ? t("close") : t("cancel")}</button>
        {!verified && <button type="button" onClick={() => void send()} disabled={saving || !file} aria-busy={saving || undefined} className="btn btn-primary h-12 sm:min-w-44">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UploadCloud className="size-4" aria-hidden />}{saving ? t("sending") : t("send")}</button>}
      </div>
    </div>
  );
}
