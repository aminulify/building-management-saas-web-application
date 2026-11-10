"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

/** Loading / error / "no longer there" frames shared by every story. */
export function StoryFrame({ state, retry, children }: { state: "loading" | "ready" | "error" | "gone"; retry: () => void; children: React.ReactNode }) {
  const t = useTranslations("owner.notifications.story");
  if (state === "loading") return <div aria-busy="true" className="space-y-3 pt-2"><span className="sr-only">{t("loading")}</span><div className="skeleton h-16 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /><div className="skeleton h-11 w-full rounded-xl" /></div>;
  if (state === "gone") return <div role="alert" className="flex flex-col items-center gap-2 px-2 py-8 text-center"><AlertTriangle className="size-8 text-amber-500" aria-hidden /><p className="font-bold text-navy">{t("goneTitle")}</p><p className="max-w-xs text-sm text-slate-600">{t("goneText")}</p></div>;
  if (state === "error") return <div role="alert" className="flex flex-col items-center gap-3 px-2 py-8 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p><button type="button" onClick={retry} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button></div>;
  return <>{children}</>;
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 py-2 text-sm"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 text-right font-semibold text-navy">{children}</dd></div>;
}

export function Person({ name, sub, avatar }: { name: string; sub: string; avatar?: string | null }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-3">
      {avatar
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        ? <img src={avatar} alt="" className="size-12 rounded-full object-cover ring-2 ring-white" />
        : <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">{initials}</span>}
      <div className="min-w-0"><p className="truncate font-bold text-navy">{name}</p><p className="truncate text-xs text-label">{sub}</p></div>
    </div>
  );
}
