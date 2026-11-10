"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Code2, Copy, Loader2, Phone, RefreshCw, Rocket } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import type { Cycle, Plan, Quote } from "./types";

interface Props { plan: Plan | null; cycle: Cycle; onClose: () => void; onSubmitted: () => void }

const PINK = "#E2136E";
const digits = (v: string) => v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/\D/g, "");
/** Same rules as the server: a Bangladesh mobile (013–019) and a 10-character TrxID. */
export const validSender = (v: string) => /^01[3-9]\d{8}$/.test(v);
export const validTrx = (v: string) => /^[A-Z0-9]{10}$/.test(v);

export function BkashUpgradeModal({ plan, cycle, onClose, onSubmitted }: Props) {
  return <Modal open={!!plan} onClose={onClose} labelledBy="bk-title" maxWidth="max-w-[560px]">{plan && <Body plan={plan} cycle={cycle} onClose={onClose} onSubmitted={onSubmitted} />}</Modal>;
}

function Body({ plan, cycle, onClose, onSubmitted }: { plan: Plan; cycle: Cycle; onClose: () => void; onSubmitted: () => void }) {
  const t = useTranslations("owner.subscription.bkash");
  const locale = useLocale();
  const toast = useToast();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [why, setWhy] = useState<string>("generic");
  const [tick, setTick] = useState(0);
  const [sender, setSender] = useState("");
  const [trx, setTrx] = useState("");
  const [errors, setErrors] = useState<{ sender?: string; trx?: string }>({});
  const [form, setForm] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = locale === "bn" ? plan.nameBn : plan.nameEn;
  const money = (v: string | number) => `৳${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(Number(v))}`;

  useEffect(() => {
    let off = false;
    setState("loading");
    authApi<Quote>("/subscriptions/quote", { method: "POST", body: { planId: plan.id, cycle } })
      .then((q) => { if (!off) { setQuote(q); setState("ready"); } })
      .catch((e) => {
        if (off) return;
        setWhy(e instanceof ApiError ? (e.reason === "usage_exceeds_plan" ? "usageExceeds" : e.reason === "active_tenancy_blocks_owner_upgrade" ? "tenancy" : e.code === "PLAN_INACTIVE" ? "inactive" : "generic") : "generic");
        setState("error");
      });
    return () => { off = true; };
  }, [plan.id, cycle, tick]);

  async function copy() {
    if (!quote?.payment.number) return;
    try { await navigator.clipboard.writeText(quote.payment.number); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { toast("error", t("copyFailed")); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setForm("");
    const next: typeof errors = {};
    if (!validSender(sender)) next.sender = t("errors.sender");
    if (!validTrx(trx)) next.trx = t("errors.trx");
    setErrors(next);
    if (next.sender || next.trx) return;
    setBusy(true);
    try {
      await authApi("/upgrade-requests", { method: "POST", body: { planId: plan.id, cycle, senderNumber: sender, trxId: trx } });
      toast("success", t("sent"));
      onSubmitted(); onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "TRXID_ALREADY_USED") { setErrors({ trx: t("errors.trxUsed") }); return; }
        if (err.code === "UPGRADE_ALREADY_PENDING") { setForm(t("errors.pending")); return; }
        if (err.code === "PLAN_INACTIVE") { setForm(t("errors.inactive")); return; }
        if (err.status === 429) { setForm(t("errors.rate")); return; }
        if (err.status === 422) { const bad = err.issues.map((i) => String(i.path)); setErrors({ sender: bad.includes("senderNumber") ? t("errors.sender") : undefined, trx: bad.includes("trxId") ? t("errors.trx") : undefined }); return; }
      }
      setForm(t("errors.generic"));
    } finally { setBusy(false); }
  }

  const amount = quote ? money(quote.payable) : "";
  const steps = quote ? [t("steps.open"), t("steps.send"), t("steps.number", { number: quote.payment.number ?? "—" }), t("steps.amount", { amount }), t("steps.reference", { ref: quote.payment.reference }), t("steps.pin"), t("steps.trx")] : [];

  return (
    <div className="space-y-4 pt-1">
      <header className="pr-10">
        <h2 id="bk-title" className="text-xl font-bold text-navy">{t("title", { name })}</h2>
        {quote && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="font-semibold">{t(`period.${cycle}`, { n: quote.months })}</span>
            <span className="text-lg font-extrabold" style={{ color: PINK }}>{amount}</span>
            {Number(quote.upgradeCredit) > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{t("credit", { credit: money(quote.upgradeCredit), total: money(quote.total) })}</span>}
            {Number(quote.savings) > 0 && <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700">{t("savings", { amount: money(quote.savings) })}</span>}
          </p>
        )}
      </header>

      {state === "loading" && <div aria-busy="true" className="space-y-3"><span className="sr-only">{t("loading")}</span><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-44 w-full rounded-xl" /></div>}
      {state === "error" && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-red-50 px-4 py-8 text-center text-red-700"><AlertTriangle className="size-7" aria-hidden />
          <p className="font-semibold">{t(`quoteError.${why}`)}</p>
          {why === "generic" && <button type="button" onClick={() => setTick((v) => v + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>}
        </div>
      )}

      {state === "ready" && quote && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="rounded-xl border p-4" style={{ borderColor: `${PINK}55`, background: `${PINK}0F` }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- static brand logo */}
                <img src="/images/bKash-Logo.png" alt="bKash" className="h-9 w-auto object-contain" />
                <div><p className="text-xs font-semibold text-slate-600">{t("personal")}</p>
                  <p className="text-lg font-extrabold tracking-wide" style={{ color: PINK }} dir="ltr">{quote.payment.number ?? t("noNumber")}</p></div>
              </div>
              {quote.payment.number && (
                <button type="button" onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold transition-all hover:-translate-y-0.5 motion-reduce:hover:translate-y-0" style={{ borderColor: `${PINK}66`, color: PINK }}>
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? t("copied") : t("copy")}
                </button>
              )}
            </div>
            <ol className="mt-3.5 list-decimal space-y-1 pl-5 text-[0.82rem] leading-snug text-slate-700 marker:font-bold marker:text-slate-500">
              {steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>

          <GlassField label={t("sender")} htmlFor="bk-sender" error={errors.sender}>
            <GlassInput id="bk-sender" icon={Phone} inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" maxLength={11} value={sender} invalid={!!errors.sender} onChange={(e) => { setSender(digits(e.target.value)); setErrors((x) => ({ ...x, sender: undefined })); }} />
          </GlassField>
          <GlassField label={t("trx")} htmlFor="bk-trx" error={errors.trx}>
            <GlassInput id="bk-trx" icon={Code2} autoComplete="off" autoCapitalize="characters" placeholder={t("trxPlaceholder")} maxLength={10} value={trx} invalid={!!errors.trx} onChange={(e) => { setTrx(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setErrors((x) => ({ ...x, trx: undefined })); }} />
          </GlassField>

          {form && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{form}</p>}
          <p className="text-xs text-label">{t("note")}</p>
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-white h-11 px-6 text-sm">{t("cancel")}</button>
            <button type="submit" disabled={busy} className="btn h-11 px-6 text-sm text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-8px_rgba(226,19,110,0.7)] motion-reduce:hover:translate-y-0" style={{ background: PINK }}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{t("submit")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
