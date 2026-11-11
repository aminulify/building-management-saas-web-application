"use client";

import { AlertTriangle, ArrowDown, FileText, Loader2, RefreshCw, ShieldAlert, Siren, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { clsx } from "clsx";
import { formatTaka } from "../../owner/dashboard/format";
import { formatDate } from "../../owner/tenants/format";
import { Reveal } from "../../owner/profile/Cards";
import { monthLabel } from "./Cards";
import { TONE_STYLE, activityStatus } from "./logic";
import type { ActivityPage } from "./types";

export function QuickActions({ onRepair, onAgreement, onIncident }: { onRepair: () => void; onAgreement: () => void; onIncident: () => void }) {
  const t = useTranslations("tenant.dashboard.quick");
  const rows = [
    { k: "repair", icon: Wrench, on: onRepair, cls: "border-emerald-200 bg-emerald-100/80 text-emerald-800 hover:bg-emerald-200/80" },
    { k: "agreement", icon: FileText, on: onAgreement, cls: "border-yellow-200 bg-yellow-100/80 text-yellow-900 hover:bg-yellow-200/80" },
    { k: "incident", icon: AlertTriangle, on: onIncident, cls: "border-red-200 bg-red-100/80 text-red-700 hover:bg-red-200/80" },
  ] as const;
  return (
    <Reveal label={t("title")} className="flex flex-col">
      <h2 className="mb-4 text-lg font-bold text-navy">{t("title")}</h2>
      <div className="flex flex-1 flex-col gap-3">
        {rows.map(({ k, icon: Icon, on, cls }) => (
          <button key={k} type="button" onClick={on} className={clsx("flex min-h-14 flex-1 items-center gap-3 rounded-xl border px-4 py-3 text-left font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0", cls)}>
            <Icon className="size-5 shrink-0" aria-hidden /><span>{t(k)}</span>
          </button>
        ))}
      </div>
    </Reveal>
  );
}

interface ActivityProps { page: ActivityPage | null; state: "loading" | "ready" | "error"; fetching: boolean; onMore: () => void; onRetry: () => void }

/** Recent Activity: newest first, scrolls inside the card, "View More" loads older rows. */
export function ActivityCard({ page, state, fetching, onMore, onRetry }: ActivityProps) {
  const t = useTranslations("tenant.dashboard.activity");
  const locale = useLocale();
  const taka = formatTaka(locale);

  const title = (a: ActivityPage["items"][number]) => {
    if (a.kind === "payment") return t(a.status === "VERIFIED" ? "payment.done" : a.status === "REJECTED" ? "payment.rejected" : "payment.sent");
    if (a.kind === "sos") return t("sos", { type: t(`sosTypes.${a.title}` as never) });
    return a.title ?? "";
  };
  const sub = (a: ActivityPage["items"][number]) => (a.kind === "payment" && a.month ? `${monthLabel(locale, a.month)} · ${formatDate(locale, a.at)}` : formatDate(locale, a.at));

  return (
    <Reveal label={t("title")} delay={0.05} className="flex flex-col">
      <h2 className="mb-3 text-lg font-bold text-navy">{t("title")}</h2>
      <div className="max-h-72 flex-1 overflow-y-auto pr-1" aria-busy={state === "loading" || undefined} aria-live="polite">
        {state === "loading" && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>}
        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50/70 px-4 py-6 text-center text-sm text-red-700"><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={onRetry} className="btn btn-white h-9 px-4 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>
        )}
        {state === "ready" && page?.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center"><Siren className="size-8 text-slate-300" aria-hidden /><p className="font-bold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t("emptyText")}</p></div>
        )}
        {page && page.items.length > 0 && (
          <ul className="divide-y divide-slate-200/70">
            {page.items.map((a) => {
              const st = activityStatus(a);
              return (
                <li key={`${a.kind}-${a.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-navy">{title(a)}</p><p className="text-xs text-slate-500">{sub(a)}</p></div>
                  <span className={clsx("shrink-0 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-bold", TONE_STYLE[st.tone])}>{t(`status.${st.key}` as never)}</span>
                  {a.amount && <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-navy">{taka(Number(a.amount))}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {page?.hasMore && (
        <button type="button" onClick={onMore} disabled={fetching} className="mt-3 inline-flex items-center justify-center gap-1.5 self-center text-sm font-semibold text-[#0A84F0] hover:underline disabled:opacity-60">
          {fetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}{t("more")}
        </button>
      )}
    </Reveal>
  );
}

export function EmergencyStrip({ onPolice, onFire, busy }: { onPolice: () => void; onFire: () => void; busy: boolean }) {
  const t = useTranslations("tenant.dashboard.emergency");
  return (
    <Reveal label={t("title")} delay={0.08} className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <p className="flex items-center gap-2 text-lg font-extrabold text-red-600"><ShieldAlert className="size-6" aria-hidden />{t("title")}</p>
      <div className="grid flex-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={onPolice} disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-red-500 px-5 text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(239,68,68,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-red-600 motion-reduce:hover:translate-y-0">🛡 {t("police")}</button>
        <button type="button" onClick={onFire} disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-yellow-400 px-5 text-sm font-bold text-yellow-950 shadow-[0_10px_24px_-12px_rgba(234,179,8,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-yellow-500 motion-reduce:hover:translate-y-0">{t("fire")} 🚒</button>
      </div>
    </Reveal>
  );
}
