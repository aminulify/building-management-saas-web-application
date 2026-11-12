"use client";

import { useEffect, useState } from "react";
import { Loader2, Rocket, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatCount, formatTaka } from "../dashboard/format";
import type { Audience, ReminderPreview } from "./types";

interface Props { target: { audience: Audience; preview: ReminderPreview } | null; onClose: () => void; onSent: () => void }

/** Bulk composer: the owners of the group are chosen, the renewal message is filled in (each owner gets their own name, plan, amount and date), then sent. */
export function BroadcastModal({ target, onClose, onSent }: Props) {
  const t = useTranslations("admin.subs.broadcast");
  const locale = useLocale();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"title" | "body" | null>(null);

  useEffect(() => {
    if (!target) return;
    setTitle(t(`${target.audience}.title`)); setBody(t(`${target.audience}.body`)); setError(null);
  }, [target, t]);

  async function send() {
    if (!target) return;
    if (title.trim().length < 3) { setError("title"); return; }
    if (body.trim().length < 3) { setError("body"); return; }
    setBusy(true);
    try {
      const out = await authApi<{ recipients: number }>("/admin/subscriptions/reminder", { method: "POST", body: { audience: target.audience, title: title.trim(), body: body.trim() } });
      toast("success", t("sent", { n: formatCount(locale)(out.recipients) }));
      onSent(); onClose();
    } catch (e) { toast("error", e instanceof ApiError && e.code === "RATE_LIMITED" ? t("tooMany") : e instanceof ApiError && e.code === "INVALID_STATE" ? t("nobody") : t("failed")); } finally { setBusy(false); }
  }
  const p = target?.preview;
  const field = "glass-input mt-2 w-full rounded-lg p-3 text-sm text-navy outline-none";
  return (
    <Modal open={!!target} onClose={() => !busy && onClose()} labelledBy="sub-broadcast" busy={busy} maxWidth="max-w-[640px]">
      {target && p && (
        <div>
          <h2 id="sub-broadcast" className="pr-10 text-xl font-bold text-navy">{t(`${target.audience}.heading`)}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/70 bg-white/60 p-3 text-sm">
            <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-sky-100 text-[#0A84F0]"><Users className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-navy">{t("recipients", { n: formatCount(locale)(p.count) })}</p>
              <p className="truncate text-xs text-slate-500">{p.sample.join(", ")}{p.count > p.sample.length ? ` +${formatCount(locale)(p.count - p.sample.length)}` : ""}</p>
            </div>
            {target.audience !== "all" && <p className="text-right text-sm font-bold text-navy">{t("totalDue", { amount: formatTaka(locale)(Number(p.totalDue)) })}</p>}
          </div>

          <label htmlFor="sub-bc-title" className="mt-4 block text-xs font-bold uppercase tracking-wider text-label">{t("titleLabel")}</label>
          <input id="sub-bc-title" value={title} maxLength={120} onChange={(e) => { setTitle(e.target.value); setError(null); }} className={`${field} h-11`} data-invalid={error === "title" || undefined} aria-invalid={error === "title" || undefined} />
          <label htmlFor="sub-bc-body" className="mt-3 block text-xs font-bold uppercase tracking-wider text-label">{t("bodyLabel")}</label>
          <textarea id="sub-bc-body" rows={6} maxLength={1500} value={body} onChange={(e) => { setBody(e.target.value); setError(null); }} className={`${field} resize-none`} data-invalid={error === "body" || undefined} aria-invalid={error === "body" || undefined} />
          {error && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{t("required")}</p>}
          <p className="mt-2 text-xs text-slate-500">{t("tokens")}</p>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-12 sm:min-w-28">{t("cancel")}</button>
            <button type="button" onClick={() => void send()} disabled={busy} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-52">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{busy ? t("sending") : t("send")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
