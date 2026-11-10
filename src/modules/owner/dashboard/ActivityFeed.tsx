"use client";

import { CheckCircle2, Siren, Wrench, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber, formatTaka, timeAgo } from "./format";
import { SectionError } from "./SectionState";
import type { ActivityKind, OwnerActivities } from "./types";

const ICON: Record<ActivityKind, { icon: LucideIcon; tone: string }> = {
  TENANT_ADDED: { icon: CheckCircle2, tone: "text-emerald-500" },
  RENT_PAID: { icon: CheckCircle2, tone: "text-emerald-500" },
  MAINTENANCE_REQUESTED: { icon: Wrench, tone: "text-amber-500" },
  ALERT_SENT: { icon: Siren, tone: "text-red-500" },
};

interface Props { data: OwnerActivities | null; state: "loading" | "ready" | "error"; fetching: boolean; onMore: () => void; onRetry: () => void }

export function ActivityFeed({ data, state, fetching, onMore, onRetry }: Props) {
  const t = useTranslations("owner.activity");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const taka = formatTaka(locale), num = formatNumber(locale);

  const line = (a: OwnerActivities["items"][number]) => {
    switch (a.kind) {
      case "TENANT_ADDED": return t("tenantAdded", { unit: a.unit ?? "" });
      case "RENT_PAID": return t("rentPaid", { unit: a.unit ?? "", amount: taka(Number(a.amount ?? 0)) });
      case "MAINTENANCE_REQUESTED": return t("maintenance", { unit: a.unit ?? "", title: a.text ?? "" });
      case "ALERT_SENT": return t("alertSent", { type: t(`alertType.${a.text ?? "OTHER"}` as never) });
    }
  };

  return (
    <section className="flex flex-col rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur-md sm:p-5" aria-labelledby="act-title">
      <h2 id="act-title" className="text-lg font-bold text-navy">{t("title")}</h2>
      <div className="mt-3 max-h-64 min-h-40 flex-1 overflow-y-auto pr-1" tabIndex={0} aria-label={t("title")}>
        {state === "error" ? <SectionError onRetry={onRetry} /> : state === "loading" || !data ? (
          <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-9 w-full" />)}</div>
        ) : data.items.length === 0 ? (
          <p className="grid h-32 place-items-center text-center text-sm text-slate-600">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-slate-200/70">
            {data.items.map((a, i) => {
              const { icon: Icon, tone } = ICON[a.kind];
              return (
                <motion.li
                  key={a.id} className="flex items-start gap-3 py-2.5"
                  initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.04 }}
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy">{line(a)}</p>
                    <time dateTime={a.at} className="text-xs text-label">{timeAgo(locale, a.at)}</time>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
      {data?.hasMore && (
        <div className="mt-2 text-right">
          <button type="button" onClick={onMore} disabled={fetching} className="text-sm font-medium text-[#0A84F0] underline underline-offset-4 transition-opacity hover:opacity-80 disabled:opacity-50">
            {fetching ? t("loading") : t("viewMore")}
          </button>
        </div>
      )}
      <span className="sr-only">{num(data?.items.length ?? 0)}</span>
    </section>
  );
}
