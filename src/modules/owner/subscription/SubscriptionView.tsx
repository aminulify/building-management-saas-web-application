"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Hourglass, Loader2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { useToast } from "@/components/feedback/Toast";
import { hl } from "@/components/typography/highlight";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatTaka, timeAgo } from "../dashboard/format";
import { BillingTable } from "./BillingTable";
import { BkashUpgradeModal } from "./BkashUpgradeModal";
import { CurrentPlan } from "./CurrentPlan";
import { PlanCard } from "./PlanCard";
import { SupportModal } from "./SupportModal";
import { CYCLES, actionFor, daysUntil, discountOf } from "./plan-math";
import type { Cycle, MySubscription, Payment, Plan } from "./types";

/** While a payment waits for the Super Admin the page checks again every 20 seconds, so an approval shows up by itself. */
const POLL_MS = 20_000;

export function SubscriptionView() {
  const t = useTranslations("owner.subscription");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const taka = formatTaka(locale);

  const plansQ = useAuthQuery<Plan[]>("/plans");
  const subQ = useAuthQuery<MySubscription>("/me/subscription");
  const payQ = useAuthQuery<Payment[]>("/me/payments");
  const [cycle, setCycle] = useState<Cycle>("MONTHLY");
  const [buy, setBuy] = useState<Plan | null>(null);
  const [support, setSupport] = useState(false);
  const [confirm, setConfirm] = useState<"plan" | "request" | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = subQ.data?.pendingRequest ?? null;
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => { subQ.reload(); payQ.reload(); }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);

  const plans = useMemo(() => (plansQ.data ?? []).filter((p) => p.audience === "OWNER").sort((a, b) => Number(a.monthlyPrice) - Number(b.monthlyPrice)), [plansQ.data]);
  const cur = subQ.data?.current ?? null;
  const reload = () => { subQ.reload(); payQ.reload(); plansQ.reload(); };
  const daysLeft = cur ? daysUntil(cur.status === "GRACE" ? cur.graceEndsAt : cur.endsAt) : 0;
  const renewable = !!cur && (cur.status === "GRACE" || daysLeft <= 7);
  const top = plans[plans.length - 1];
  const ready = plansQ.state === "ready" && subQ.state === "ready";
  const dateLong = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "long", day: "2-digit", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(iso));

  async function cancel() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === "plan" && cur) await authApi(`/subscriptions/${cur.id}/cancel`, { method: "POST" });
      if (confirm === "request" && pending) await authApi(`/upgrade-requests/${pending.id}/cancel`, { method: "POST" });
      toast("success", t(confirm === "plan" ? "toast.planCancelled" : "toast.requestCancelled"));
      setConfirm(null); reload();
    } catch { toast("error", t("toast.error")); } finally { setBusy(false); }
  }

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-72 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header"><h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1></FadeIn>

      {(plansQ.state === "error" || subQ.state === "error") && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}

      {(plansQ.state === "loading" || subQ.state === "loading") && !(plansQ.state === "error" || subQ.state === "error") && (
        <div aria-busy="true" className="space-y-4"><span className="sr-only">{t("loading")}</span>
          <div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-32 rounded-2xl" /><div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-96 rounded-2xl" />)}</div></div>
      )}

      {ready && subQ.data && (
        <>
          {pending && (
            <FadeIn>
              <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 backdrop-blur-md">
                <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-600"><Hourglass className="size-5 motion-safe:animate-pulse" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-amber-900">{t("pending.title", { plan: locale === "bn" ? pending.plan.nameBn : pending.plan.nameEn })}</p>
                  <p className="text-sm text-amber-800">{t("pending.text", { amount: taka(Number(pending.expectedAmount)), trx: pending.trxId, when: timeAgo(locale, pending.createdAt) })}</p>
                </div>
                {confirm === "request" ? (
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold text-amber-900">{t("pending.confirm")}</span>
                    <button type="button" onClick={cancel} disabled={busy} className="btn btn-danger h-9 px-3 text-xs">{busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : t("yes")}</button>
                    <button type="button" onClick={() => setConfirm(null)} className="btn btn-white h-9 px-3 text-xs">{t("no")}</button></div>
                ) : <button type="button" onClick={() => setConfirm("request")} className="btn btn-white h-9 px-4 text-xs">{t("pending.cancel")}</button>}
              </div>
            </FadeIn>
          )}

          <CurrentPlan sub={subQ.data} plans={plans} />

          <section aria-label={t("choose.aria")} className="space-y-4">
            <FadeIn><h2 className="text-center text-base font-bold text-navy sm:text-lg">{t("choose.title")}</h2></FadeIn>
            <div role="tablist" aria-label={t("choose.cycleAria")} className="relative mx-auto grid max-w-2xl grid-cols-3 rounded-2xl border border-white/70 bg-white/60 p-1.5 shadow-sm backdrop-blur-xl">
              {CYCLES.map((c) => {
                const on = cycle === c;
                const pct = plans[0] ? discountOf(plans[0], c) : 0;
                return (
                  <button key={c} type="button" role="tab" aria-selected={on} onClick={() => setCycle(c)} className="relative z-10 h-11 rounded-xl px-2 text-sm font-semibold text-navy transition-colors focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
                    {on && <motion.span layoutId="cycle-pill" transition={{ duration: reduce ? 0 : 0.35 }} className="absolute inset-0 -z-10 rounded-xl bg-white shadow-[0_6px_18px_-8px_rgba(15,23,42,0.35)] ring-1 ring-slate-200" />}
                    {t(`cycle.${c}`)} <span className={clsx("text-xs font-bold", pct ? "text-[#7b2ff7]" : "text-slate-400")}>(-{pct}%)</span>
                  </button>
                );
              })}
            </div>

            {plans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-12 text-center text-sm text-slate-600">{t("plans.none")}</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {plans.map((p, i) => (
                  <PlanCard key={p.id} plan={p} plans={plans} index={i} cycle={cycle} popular={plans.length >= 3 && i === 1} locked={!!pending}
                    action={actionFor(plans, p, cur?.plan.code ?? null, renewable)} onChoose={setBuy} />
                ))}
              </div>
            )}
          </section>

          <BillingTable state={payQ.state} payments={payQ.data ?? []} onRetry={payQ.reload} onSupport={() => setSupport(true)} />

          <div className="grid gap-4 md:grid-cols-2">
            <motion.section
              initial={{ opacity: 0, y: reduce ? 0 : 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
              className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50/80 to-pink-50/70 p-5 backdrop-blur-xl"
            >
              <span aria-hidden className="grid size-10 place-items-center rounded-xl border border-red-200 bg-white/70 text-red-500"><TriangleAlert className="size-5" /></span>
              {cur ? (
                <>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-navy">{t(cur.cancelledAt ? "renewal.endsTitle" : "renewal.title")}{cur.endsAt ? `: ${dateLong(cur.endsAt)}` : ""}</h3>
                      <p className="mt-0.5 text-xs text-slate-600">{t(cur.cancelledAt ? "renewal.cancelledNote" : "renewal.note")}</p>
                    </div>
                    {!cur.cancelledAt && (confirm === "plan" ? (
                      <div className="flex items-center gap-2"><span className="text-xs font-semibold text-red-700">{t("renewal.confirm")}</span>
                        <button type="button" onClick={cancel} disabled={busy} className="btn btn-danger h-9 px-3 text-xs">{busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : t("yes")}</button>
                        <button type="button" onClick={() => setConfirm(null)} className="btn btn-white h-9 px-3 text-xs">{t("no")}</button></div>
                    ) : <button type="button" onClick={() => setConfirm("plan")} className="btn btn-danger h-10 px-5 text-sm"><XCircle className="size-4" aria-hidden />{t("renewal.cancel")}</button>)}
                  </div>
                </>
              ) : (
                <div className="mt-3"><h3 className="font-bold text-navy">{t("renewal.noneTitle")}</h3><p className="mt-0.5 text-xs text-slate-600">{t("renewal.noneText")}</p></div>
              )}
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: reduce ? 0 : 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: reduce ? 0 : 0.08 }}
              className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-yellow-50/70 p-5 backdrop-blur-xl"
            >
              <span aria-hidden className="grid size-10 place-items-center rounded-xl border border-amber-200 bg-white/70 text-amber-500"><CalendarClock className="size-5" /></span>
              <h3 className="mt-3 font-bold text-navy">{t("enterprise.title")}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-700">{t("enterprise.text", { units: top ? top.unitLimit : 0 })}</p>
              <button type="button" onClick={() => setSupport(true)} className="mt-3 text-sm font-semibold text-[#0A84F0] underline-offset-4 hover:underline">{t("enterprise.cta")}</button>
            </motion.section>
          </div>
        </>
      )}

      <BkashUpgradeModal plan={buy} cycle={cycle} onClose={() => setBuy(null)} onSubmitted={reload} />
      <SupportModal open={support} onClose={() => setSupport(false)} />
    </div>
  );
}
