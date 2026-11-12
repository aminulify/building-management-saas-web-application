"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, CalendarDays, Check, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import type { BoostSettings } from "./types";

/** Paid Boost settings: on / off, the fee in taka, and how many days a boost lasts. Saved to the platform settings. */
export function BoostSettingsCard() {
  const t = useTranslations("admin.paidBoost.settings");
  const toast = useToast();
  const q = useAuthQuery<BoostSettings>("/admin/boosts/settings");
  const [enabled, setEnabled] = useState(true);
  const [fee, setFee] = useState("");
  const [days, setDays] = useState("");
  const [errors, setErrors] = useState<{ fee?: string; days?: string }>({});
  const [busy, setBusy] = useState(false);
  const d = q.data;

  useEffect(() => { if (d) { setEnabled(d.enabled); setFee(String(Number(d.fee))); setDays(String(d.durationDays)); } }, [d]);
  const dirty = !!d && (enabled !== d.enabled || Number(fee) !== Number(d.fee) || Number(days) !== d.durationDays);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const f = Number(fee), n = Number(days);
    if (!Number.isFinite(f) || f < 10 || f > 100000 || Math.round(f * 100) !== f * 100) next.fee = t("errors.fee");
    if (!Number.isInteger(n) || n < 1 || n > 90) next.days = t("errors.days");
    setErrors(next);
    if (next.fee || next.days) return;
    setBusy(true);
    try { await authApi("/admin/boosts/settings", { method: "PATCH", body: { enabled, fee: f, durationDays: n } }); toast("success", t("saved")); q.reload(); }
    catch (err) { toast("error", err instanceof ApiError && err.status === 422 ? t("errors.invalid") : t("errors.generic")); }
    finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="pb-settings" className="glass-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3"><span aria-hidden className="grid size-10 place-items-center rounded-xl bg-brand-gradient text-white"><Settings2 className="size-5" /></span><div><h2 id="pb-settings" className="text-lg font-bold text-navy">{t("title")}</h2><p className="text-xs text-slate-600">{t("subtitle")}</p></div></div>

      {q.state === "loading" && !d && <div aria-busy="true" className="grid gap-3 sm:grid-cols-3"><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-20 rounded-xl" /><div className="skeleton h-20 rounded-xl" /></div>}
      {q.state === "error" && !d && <div role="alert" className="flex items-center gap-3 text-red-700"><AlertTriangle className="size-5" aria-hidden /><p className="text-sm font-semibold">{t("error")}</p><button type="button" onClick={q.reload} className="btn btn-white h-9 px-4 text-xs"><RefreshCw className="size-3.5" aria-hidden />{t("retry")}</button></div>}

      {d && (
        <form onSubmit={save} noValidate className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-[auto_1fr_1fr_auto]">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-label">{t("enabled")}</p>
            <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled((v) => !v)} className={clsx("relative inline-flex h-12 w-full min-w-40 items-center gap-3 rounded-lg border px-3 text-sm font-bold transition-colors duration-300", enabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500")}>
              <span aria-hidden className={clsx("relative h-6 w-11 rounded-full transition-colors duration-300", enabled ? "bg-emerald-500" : "bg-slate-300")}><span className={clsx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all duration-300", enabled ? "left-[1.4rem]" : "left-0.5")} /></span>
              {enabled ? t("on") : t("off")}
            </button>
          </div>
          <GlassField label={t("fee")} htmlFor="pb-fee" error={errors.fee} hint={t("feeHint")}><GlassInput id="pb-fee" icon={Banknote} inputMode="decimal" value={fee} invalid={!!errors.fee} onChange={(e) => { setFee(e.target.value.replace(/[^\d.]/g, "")); setErrors((x) => ({ ...x, fee: undefined })); }} /></GlassField>
          <GlassField label={t("days")} htmlFor="pb-days" error={errors.days} hint={t("daysHint")}><GlassInput id="pb-days" icon={CalendarDays} inputMode="numeric" value={days} invalid={!!errors.days} onChange={(e) => { setDays(e.target.value.replace(/\D/g, "")); setErrors((x) => ({ ...x, days: undefined })); }} /></GlassField>
          <div className="sm:col-span-2 xl:col-span-1 xl:pt-7"><button type="submit" disabled={busy || !dirty} aria-busy={busy || undefined} className="btn btn-primary h-12 w-full px-6 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("saving") : t("save")}</button></div>
        </form>
      )}
    </section>
  );
}
