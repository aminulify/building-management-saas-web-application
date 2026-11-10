"use client";

import { useEffect, useState } from "react";
import { Check, Crown, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { formatNumber, formatTaka } from "../owner/dashboard/format";

interface Plan { id: string; code: string; nameBn: string; nameEn: string; audience: string; listingLimit: number; propertyLimit: number; prices: { MONTHLY: { total: string } } }

/** Shown when listing is not allowed yet: why, and the plans that unlock it (prices come from the server). */
export function UpgradePanel({ reason }: { reason: "plan" | "limit" }) {
  const t = useTranslations("owner.marketplace.upgrade");
  const locale = useLocale();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api<Plan[]>("/plans").then((p) => setPlans(p.filter((x) => x.audience === "OWNER"))).catch(() => setFailed(true)); }, []);

  return (
    <div className="px-1 py-2 text-center">
      <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-gradient text-white"><Crown className="size-7" /></span>
      <h2 id="mk-upgrade-title" className="mt-3 text-xl font-bold text-navy">{t(reason === "plan" ? "planTitle" : "limitTitle")}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">{t(reason === "plan" ? "planText" : "limitText")}</p>
      <div className="mt-5 grid gap-3 text-left sm:grid-cols-3">
        {plans === null && !failed && [0, 1, 2].map((i) => <div key={i} className="skeleton h-36 rounded-xl" />)}
        {failed && <p role="alert" className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">{t("plansError")}</p>}
        {plans?.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white/80 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0">
            <p className="flex items-center gap-1.5 text-sm font-bold text-navy">{i === 1 && <Sparkles className="size-4 text-[#F413E6]" aria-hidden />}{locale === "bn" ? p.nameBn : p.nameEn}</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0A84F0]">{taka(Number(p.prices.MONTHLY.total))}<span className="text-xs font-semibold text-label">{t("perMonth")}</span></p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" aria-hidden />{t("listings", { n: n(p.listingLimit) })}</li>
              <li className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" aria-hidden />{t("properties", { n: n(p.propertyLimit) })}</li>
            </ul>
          </div>
        ))}
      </div>
      <Link href={"/owner/subscription" as never} className="btn btn-primary mt-5 h-11 px-7 text-sm">{t("cta")}</Link>
    </div>
  );
}

export function UpgradeModal({ open, reason, onClose }: { open: boolean; reason: "plan" | "limit"; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} labelledBy="mk-upgrade-title" maxWidth="max-w-[720px]">{open && <UpgradePanel reason={reason} />}</Modal>;
}
