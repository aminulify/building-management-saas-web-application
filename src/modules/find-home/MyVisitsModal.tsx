"use client";

import { useState } from "react";
import { AlertTriangle, CalendarX, CalendarClock, Loader2, RefreshCw, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { whenLabel } from "./visit-time";
import type { VisitRow, VisitStatus } from "./types";

const TONE: Record<VisitStatus, string> = { PENDING: "bg-amber-50 text-amber-700", CONFIRMED: "bg-emerald-50 text-emerald-700", DECLINED: "bg-red-50 text-red-700", CANCELLED: "bg-slate-100 text-slate-600" };

interface Props { open: boolean; onClose: () => void; onOpenHome: (id: string) => void }

/** Every visit the person asked for, with cancel for the ones still open. */
export function MyVisitsModal({ open, onClose, onOpenHome }: Props) {
  return <Modal open={open} onClose={onClose} labelledBy="fh-visits-title" maxWidth="max-w-[600px]">{open && <Body onOpenHome={(id) => { onClose(); onOpenHome(id); }} />}</Modal>;
}

function Body({ onOpenHome }: { onOpenHome: (id: string) => void }) {
  const t = useTranslations("owner.findHome.visits");
  const v = useTranslations("owner.findHome.visit");
  const locale = useLocale();
  const toast = useToast();
  const q = useAuthQuery<VisitRow[]>("/me/visits");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusyId(id);
    try { await authApi(`/visits/${id}`, { method: "DELETE" }); toast("success", v("cancelled")); q.reload(); }
    catch { toast("error", v("errors.generic")); } finally { setBusyId(null); }
  }

  const rows = q.data ?? [];
  return (
    <div>
      <h2 id="fh-visits-title" className="mb-4 pr-10 text-lg font-bold text-navy">{t("title")}</h2>
      {q.state === "loading" && <div aria-busy="true" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 w-full rounded-xl" />)}</div>}
      {q.state === "error" && (
        <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
      )}
      {q.state === "ready" && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center"><CalendarX className="size-10 text-slate-300" aria-hidden /><p className="font-bold text-navy">{t("emptyTitle")}</p><p className="max-w-xs text-sm text-slate-600">{t("emptyText")}</p></div>
      )}
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white/80 p-3">
            <button type="button" onClick={() => onOpenHome(r.listing.id)} className="size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100" aria-label={t("open", { title: r.listing.title })}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
              {r.listing.coverUrl && <img src={r.listing.coverUrl} alt="" className="size-full object-cover" />}
            </button>
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => onOpenHome(r.listing.id)} className="block max-w-full truncate text-left text-sm font-bold text-navy hover:underline">{r.listing.title}</button>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600"><CalendarClock className="size-3.5" aria-hidden />{whenLabel(locale, r.scheduledFor)}</p>
              {r.responseNote && <p className="mt-0.5 truncate text-xs italic text-slate-500">“{r.responseNote}”</p>}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className={clsx("rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold", TONE[r.status])}>{v(`status.${r.status}`)}</span>
                {(r.status === "PENDING" || r.status === "CONFIRMED") && (
                  <button type="button" onClick={() => cancel(r.id)} disabled={busyId === r.id} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
                    {busyId === r.id ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <X className="size-3" aria-hidden />}{v("cancel")}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
