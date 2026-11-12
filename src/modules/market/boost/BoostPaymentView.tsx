"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, BadgeCheck, Check, Clock, Code2, Copy, ImageOff, Loader2, MapPin, Phone, RefreshCw, Rocket, ShieldCheck, Star, TrendingUp, XCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { GlassField, GlassInput } from "@/components/glass/GlassField";
import { hl } from "@/components/typography/highlight";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { useArea } from "../../find-home/area";
import { validSender, validTrx } from "../../owner/subscription/BkashUpgradeModal";
import type { BoostSettings, MyBoost } from "./types";

interface ListingLite { id: string; title: string; type: "RENT" | "SALE"; category: string; price: string; status: string; isOwn: boolean; locationLabel: string; photoUrls: string[] }

const PINK = "#E2136E";
const digits = (v: string) => v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/\D/g, "");

/** The payment page of a boost ("similar to the subscription plans"): what is paid, the payment methods, the bKash details and the form. */
export function BoostPaymentView({ listingId }: { listingId: string }) {
  const t = useTranslations("owner.marketplace.boost");
  const pay = useTranslations("owner.marketplace.boost.pay");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const router = useRouter();
  const area = useArea();
  const listing = useAuthQuery<ListingLite>(`/listings/${listingId}`);
  const settings = useAuthQuery<BoostSettings>("/boosts/settings");
  const mine = useAuthQuery<{ items: MyBoost[] }>(`/boosts?listingId=${listingId}`);
  const [sender, setSender] = useState("");
  const [trx, setTrx] = useState("");
  const [errors, setErrors] = useState<{ sender?: string; trx?: string }>({});
  const [form, setForm] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [method, setMethod] = useState<"bkash">("bkash");

  const back = `${area}/marketplace`;
  const money = (v: string | number) => `৳${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 2 }).format(Number(v))}`;
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const l = listing.data, s = settings.data;
  const latest = mine.data?.items[0] ?? null;
  const active = latest?.state === "ACTIVE" ? latest : null;
  const pending = latest?.state === "PENDING" ? latest : null;

  async function copy() {
    if (!s?.payment.number) return;
    try { await navigator.clipboard.writeText(s.payment.number); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { toast("error", pay("copyFailed")); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setForm("");
    const next: typeof errors = {};
    if (!validSender(sender)) next.sender = pay("errors.sender");
    if (!validTrx(trx)) next.trx = pay("errors.trx");
    setErrors(next);
    if (next.sender || next.trx) return;
    setBusy(true);
    try {
      await authApi("/boosts", { method: "POST", body: { listingId, senderNumber: sender, trxId: trx } });
      toast("success", pay("sent"));
      mine.reload();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "TRXID_ALREADY_USED") { setErrors({ trx: pay("errors.trxUsed") }); return; }
        if (err.code === "INVALID_STATE") { setForm(pay(`errors.${err.reason === "boost_disabled" ? "disabled" : err.reason === "already_boosted" ? "already" : err.reason === "boost_pending" ? "pending" : "notLive"}`)); mine.reload(); return; }
        if (err.status === 429) { setForm(pay("errors.rate")); return; }
        if (err.status === 422) { const bad = err.issues.map((i) => String(i.path)); setErrors({ sender: bad.includes("senderNumber") ? pay("errors.sender") : undefined, trx: bad.includes("trxId") ? pay("errors.trx") : undefined }); return; }
      }
      setForm(pay("errors.generic"));
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!pending) return;
    setBusy(true);
    try { await authApi(`/boosts/${pending.id}/cancel`, { method: "POST" }); toast("success", pay("cancelled")); mine.reload(); } catch { toast("error", pay("errors.generic")); } finally { setBusy(false); }
  }

  const loading = (listing.state === "loading" && !l) || (settings.state === "loading" && !s) || (mine.state === "loading" && !mine.data);
  const failed = (listing.state === "error" && !l) || (settings.state === "error" && !s) || (mine.state === "error" && !mine.data);
  const unusable = !!l && (!l.isOwn || l.status !== "PUBLISHED");

  const steps = s ? [pay("steps.open"), pay("steps.send"), pay("steps.number", { number: s.payment.number ?? "—" }), pay("steps.amount", { amount: money(s.fee) }), pay("steps.reference", { ref: s.payment.reference }), pay("steps.pin"), pay("steps.trx")] : [];

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <Link href={back as never} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-[#0A84F0]"><ArrowLeft className="size-4" aria-hidden />{pay("backToListings")}</Link>
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("pageTitle", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("pageSubtitle")}</p>
      </FadeIn>

      {loading && <div aria-busy="true" className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"><span className="sr-only">{pay("loading")}</span><div className="skeleton h-80 rounded-2xl" /><div className="skeleton h-[28rem] rounded-2xl" /></div>}

      {failed && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-14 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{pay("error")}</p>
          <button type="button" onClick={() => { listing.reload(); settings.reload(); mine.reload(); }} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{pay("retry")}</button></div>
      )}

      {!loading && !failed && l && s && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* order summary */}
          <motion.aside initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} aria-label={pay("summary")} className="glass-card overflow-hidden p-0">
            <div className="relative aspect-[16/9] bg-slate-100">
              {l.photoUrls[0] ? <img src={l.photoUrls[0]} alt={l.title} className="size-full object-cover" /> : <div className="grid size-full place-items-center text-slate-300"><ImageOff className="size-10" aria-hidden /></div>}
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[0.7rem] font-bold text-white shadow"><Star className="size-3 fill-current" aria-hidden />{pay("willBeFeatured")}</span>
            </div>
            <div className="space-y-4 p-5">
              <div><h2 className="truncate text-lg font-bold text-navy" title={l.title}>{l.title}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="size-4 shrink-0 text-pink-500" aria-hidden />{l.locationLabel || "—"}</p><p className="mt-1 font-extrabold text-[#0A84F0]">{money(l.price)}</p></div>
              <dl className="space-y-2 rounded-xl bg-slate-50/80 p-4 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-600">{pay("boostFee")}</dt><dd className="font-semibold text-navy">{money(s.fee)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-600">{pay("duration")}</dt><dd className="font-semibold text-navy">{pay("days", { count: s.durationDays })}</dd></div>
                <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-base"><dt className="font-bold text-navy">{pay("total")}</dt><dd className="font-extrabold" style={{ color: PINK }}>{money(s.fee)}</dd></div>
              </dl>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2"><BadgeCheck className="size-4 shrink-0 text-emerald-500" aria-hidden />{t("benefits.highlight.title")}</li>
                <li className="flex items-center gap-2"><TrendingUp className="size-4 shrink-0 text-sky-500" aria-hidden />{t("benefits.priority.title")}</li>
                <li className="flex items-center gap-2"><Rocket className="size-4 shrink-0 text-fuchsia-500" aria-hidden />{t("benefits.faster.title")}</li>
              </ul>
            </div>
          </motion.aside>

          {/* payment */}
          <motion.section initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: reduce ? 0 : 0.08 }} aria-label={pay("methods")} className="glass-card space-y-5 p-5 sm:p-6">
            {unusable && <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{l.isOwn ? pay("errors.notLive") : pay("errors.notYours")}</p>}
            {!s.enabled && !active && !pending && <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{pay("errors.disabled")}</p>}

            {active && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 text-emerald-900"><p className="flex items-center gap-2 text-lg font-bold"><Check className="size-5" aria-hidden />{pay("activeTitle")}</p>
                <p className="mt-1 text-sm">{pay("activeText", { date: active.endsAt ? date(active.endsAt) : "—" })}</p>
                <button type="button" onClick={() => router.push(back as never)} className="btn btn-white mt-4 h-10 px-5 text-sm">{pay("backToListings")}</button></div>
            )}

            {pending && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 text-amber-900"><p className="flex items-center gap-2 text-lg font-bold"><Clock className="size-5" aria-hidden />{pay("pendingTitle")}</p>
                <p className="mt-1 text-sm">{pay("pendingText")}</p>
                <p className="mt-2 text-xs">{pay("pendingRef", { trx: pending.trxId, amount: money(pending.amount), date: date(pending.createdAt) })}</p>
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => router.push(back as never)} className="btn btn-white h-10 px-5 text-sm">{pay("backToListings")}</button>
                  <button type="button" disabled={busy} onClick={() => void cancel()} className="btn btn-white h-10 px-5 text-sm !text-red-600">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />}{pay("cancelRequest")}</button></div></div>
            )}

            {!active && !pending && !unusable && s.enabled && (
              <>
                {latest?.state === "REJECTED" && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><span className="font-bold">{pay("rejectedTitle")}</span> {latest.rejectionReason}</p>}

                <div>
                  <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">{pay("methods")}</h2>
                  <div role="radiogroup" aria-label={pay("methods")} className="grid gap-2.5 sm:grid-cols-3">
                    <label className={clsx("flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-3 transition-all duration-300", method === "bkash" ? "border-[#E2136E] bg-pink-50/70" : "border-slate-200 bg-white/70")}>
                      <input type="radio" name="boost-method" checked={method === "bkash"} onChange={() => setMethod("bkash")} className="size-4 accent-[#E2136E]" />
                      <img src="/images/bKash-Logo.png" alt="bKash" className="h-7 w-auto object-contain" />
                    </label>
                    {(["nagad", "rocket"] as const).map((m) => (
                      <div key={m} aria-disabled="true" className="flex cursor-not-allowed items-center justify-between gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 opacity-70"><span className="font-bold text-slate-500">{pay(`methodNames.${m}`)}</span><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[0.62rem] font-bold uppercase text-slate-600">{pay("soon")}</span></div>
                    ))}
                  </div>
                </div>

                <form onSubmit={submit} noValidate className="space-y-4">
                  <div className="rounded-xl border p-4" style={{ borderColor: `${PINK}55`, background: `${PINK}0F` }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div><p className="text-xs font-semibold text-slate-600">{pay("personal")}</p><p className="text-lg font-extrabold tracking-wide" style={{ color: PINK }} dir="ltr">{s.payment.number ?? pay("noNumber")}</p><p className="text-xs text-slate-600">{pay("payExactly", { amount: money(s.fee) })}</p></div>
                      {s.payment.number && <button type="button" onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-bold transition-all hover:-translate-y-0.5 motion-reduce:hover:translate-y-0" style={{ borderColor: `${PINK}66`, color: PINK }}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? pay("copied") : pay("copy")}</button>}
                    </div>
                    <ol className="mt-3.5 list-decimal space-y-1 pl-5 text-[0.82rem] leading-snug text-slate-700 marker:font-bold marker:text-slate-500">{steps.map((x) => <li key={x}>{x}</li>)}</ol>
                  </div>

                  <GlassField label={pay("sender")} htmlFor="bs-sender" error={errors.sender}>
                    <GlassInput id="bs-sender" icon={Phone} inputMode="numeric" autoComplete="tel" placeholder="01XXXXXXXXX" maxLength={11} value={sender} invalid={!!errors.sender} onChange={(e) => { setSender(digits(e.target.value)); setErrors((x) => ({ ...x, sender: undefined })); }} />
                  </GlassField>
                  <GlassField label={pay("trx")} htmlFor="bs-trx" error={errors.trx}>
                    <GlassInput id="bs-trx" icon={Code2} autoComplete="off" autoCapitalize="characters" placeholder={pay("trxPlaceholder")} maxLength={10} value={trx} invalid={!!errors.trx} onChange={(e) => { setTrx(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setErrors((x) => ({ ...x, trx: undefined })); }} />
                  </GlassField>

                  {form && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{form}</p>}
                  <p className="flex items-start gap-2 text-xs text-label"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />{pay("note")}</p>
                  <button type="submit" disabled={busy} className="btn h-12 w-full text-sm text-white transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-8px_rgba(226,19,110,0.7)] motion-reduce:hover:translate-y-0" style={{ background: PINK }}>
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}{pay("submit", { amount: money(s.fee) })}
                  </button>
                </form>
              </>
            )}
          </motion.section>
        </div>
      )}
    </div>
  );
}
