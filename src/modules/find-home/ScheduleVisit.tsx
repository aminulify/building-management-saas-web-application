"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CalendarDays, CheckCircle2, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useToast } from "@/components/feedback/Toast";
import { SLOTS, dayStr, toBdIso, whenLabel } from "./visit-time";
import type { VisitRow } from "./types";

interface Props { listingId: string; existing: VisitRow | null; onChanged: () => void }

/** "Schedule Visit": a date and time (plus an optional note) sent to the owner; shows the pending/confirmed request with a cancel button. */
export function ScheduleVisit({ listingId, existing, onChanged }: Props) {
  const t = useTranslations("owner.findHome.visit");
  const locale = useLocale();
  const toast = useToast();
  const min = useMemo(() => dayStr(0), []);
  const max = useMemo(() => dayStr(60), []);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const explain = (e: unknown) => {
    if (e instanceof ApiError) {
      const r = e.reason ?? e.issues[0]?.code ?? e.code;
      const known = ["too_soon", "too_far", "outside_visiting_hours", "visit_already_requested", "own_listing"];
      if (known.includes(r)) return t(`errors.${r}`);
      if (e.status === 429) return t("errors.rate");
    }
    return t("errors.generic");
  };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!date) { setError(t("errors.pickDate")); return; }
    setBusy(true); setError("");
    try {
      await authApi(`/listings/${listingId}/visits`, { method: "POST", body: { scheduledFor: toBdIso(date, time), note: note.trim() || undefined } });
      toast("success", t("sent"));
      onChanged();
    } catch (e) { setError(explain(e)); } finally { setBusy(false); }
  }

  async function cancel() {
    if (!existing) return;
    setBusy(true); setError("");
    try { await authApi(`/visits/${existing.id}`, { method: "DELETE" }); toast("success", t("cancelled")); onChanged(); }
    catch (e) { setError(explain(e)); } finally { setBusy(false); }
  }

  if (existing) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4" role="status">
        <p className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="size-4" aria-hidden />{t(`status.${existing.status}`)}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-700"><CalendarClock className="size-4 text-slate-500" aria-hidden />{whenLabel(locale, existing.scheduledFor)}</p>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
        <button type="button" onClick={cancel} disabled={busy} className="btn btn-danger mt-3 h-9 px-4 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}{t("cancel")}</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white/70 p-4" noValidate>
      <p className="flex items-center gap-2 text-sm font-bold text-navy"><CalendarDays className="size-4 text-[#0A84F0]" aria-hidden />{t("title")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="visit-date" className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("date")}</label>
          <input id="visit-date" type="date" min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} required className="glass-input h-11 w-full rounded-lg px-3 text-sm text-navy outline-none" />
        </div>
        <div>
          <label htmlFor="visit-time" className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("time")}</label>
          <select id="visit-time" value={time} onChange={(e) => setTime(e.target.value)} className="glass-input h-11 w-full rounded-lg px-3 text-sm text-navy outline-none">
            {SLOTS.map((s) => <option key={s} value={s}>{new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { timeStyle: "short", timeZone: "UTC" }).format(new Date(`1970-01-01T${s}:00Z`))}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="visit-note" className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("note")}</label>
        <textarea id="visit-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder={t("notePlaceholder")} className="glass-input w-full resize-none rounded-lg px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
      </div>
      <p className="text-xs text-label">{t("hint")}</p>
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary h-11 w-full text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}{t("submit")}</button>
    </form>
  );
}
