"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Mail, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { formatTaka } from "../dashboard/format";
import { day } from "../manage-home/format";
import { Avatar } from "../owners/OwnersTable";
import { PLAN_ICON, STATE_STYLE } from "./SubTable";
import type { SubDetails, SubRow } from "./types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}
const PAY_STYLE: Record<string, string> = { SUCCESS: "bg-emerald-100 text-emerald-700", PENDING_REVIEW: "bg-amber-100 text-amber-700", FAILED: "bg-red-100 text-red-700", REFUNDED: "bg-sky-100 text-sky-700", INITIATED: "bg-slate-200 text-slate-600" };

function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold text-slate-600"><span>{label}</span><span className="text-navy">{used} / {cap}</span></div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={used} className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200/70"><div className={clsx("h-full rounded-full bg-gradient-to-r transition-all duration-500", pct >= 100 ? "from-red-500 to-red-300" : "from-[#0A84F0] to-[#48BDFA]")} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** One owner's plan in full: dates, limits against usage, boosts and the payment history. */
export function DetailsModal({ row, onClose, onMessage }: { row: SubRow | null; onClose: () => void; onMessage: (r: SubRow) => void }) {
  const t = useTranslations("admin.subs.details");
  const tt = useTranslations("admin.subs.table");
  const locale = useLocale();
  const [d, setD] = useState<SubDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!row) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<SubDetails>(`/admin/subscriptions/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);
  const taka = formatTaka(locale);
  const plan = d ? PLAN_ICON[d.plan.code] ?? PLAN_ICON.PRIMARY! : null;
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";

  return (
    <Modal open={!!row} onClose={onClose} labelledBy="sub-view" maxWidth="max-w-[760px]">
      {row && (
        <div>
          <h2 id="sub-view" className="pr-10 text-xl font-bold text-navy">{t("title")}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-28 w-full rounded-xl" /><div className="skeleton h-32 w-full rounded-xl" /></div>}
          {state === "error" && <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p><button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>}
          {state === "ready" && d && plan && (
            <div className="mt-4 space-y-4">
              <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
                <Avatar name={d.owner.fullName} url={d.owner.avatarUrl} size="size-14" />
                <div className="min-w-0 flex-1"><h3 className="truncate text-lg font-bold text-navy">{d.owner.fullName}</h3>
                  <p className="text-xs font-semibold text-[#0A84F0]">{d.owner.ownerCode ? tt("ownerId", { code: d.owner.ownerCode }) : ""}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500"><span className="flex items-center gap-1"><Phone className="size-3 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.owner.phone)}</span></span>{d.owner.email && <span className="flex items-center gap-1 break-all"><Mail className="size-3 text-[#9333EA]" aria-hidden />{d.owner.email}</span>}</p></div>
                <button type="button" onClick={() => onMessage(row)} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
              </div>

              <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-3")}>
                <Fact label={t("package")}><plan.icon className={clsx("mr-1.5 inline size-4 align-[-3px]", plan.tone)} aria-hidden />{locale === "bn" ? d.plan.nameBn : d.plan.nameEn}</Fact>
                <Fact label={t("status")}><span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATE_STYLE[d.state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{tt(`state.${d.state}`)}</span></Fact>
                <Fact label={t("cycle")}>{tt("months", { count: d.months })}</Fact>
                <Fact label={t("starts")}>{d.startsAt ? day(locale, d.startsAt) : t("none")}</Fact>
                <Fact label={t("ends")}>{d.endsAt ? day(locale, d.endsAt) : t("none")}{d.daysLeft !== null && d.daysLeft >= 0 && <span className="ml-1.5 text-xs font-medium text-slate-500">({t("daysLeft", { n: d.daysLeft })})</span>}</Fact>
                <Fact label={t("grace")}>{d.graceEndsAt ? day(locale, d.graceEndsAt) : t("none")}</Fact>
                <Fact label={t("amount")}>{taka(Number(d.amount))}</Fact>
                <Fact label={t("monthly")}>{taka(Number(d.plan.monthlyPrice))}</Fact>
                <Fact label={t("boosts")}>{d.boosts}</Fact>
              </dl>

              <section aria-label={t("usage")} className={clsx(card, "space-y-3")}>
                <h3 className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("usage")}</h3>
                <Meter label={t("properties")} used={d.usage.properties} cap={d.usage.propertyLimit} />
                <Meter label={t("units")} used={d.usage.units} cap={d.usage.unitLimit} />
                <Meter label={t("listings")} used={d.usage.listings} cap={d.usage.listingLimit} />
              </section>

              <section aria-label={t("payments")} className={card}>
                <h3 className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("payments")}</h3>
                {d.payments.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noPayments")}</p> : (
                  <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                    {d.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm">
                        <span className="min-w-0"><b className="font-mono text-navy">{p.trxId}</b><span className="block text-xs text-slate-500">{day(locale, p.createdAt)}{p.invoice ? ` · ${p.invoice}` : ""}</span></span>
                        <span className="shrink-0 text-right"><b className="text-navy">{taka(Number(p.amount))}</b><span className={clsx("ml-2 rounded-full px-2 py-0.5 text-[0.68rem] font-bold", PAY_STYLE[p.status] ?? PAY_STYLE.INITIATED)}>{t(`pay.${p.status}` as never)}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
          <div className="mt-5 flex justify-end"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>
        </div>
      )}
    </Modal>
  );
}
