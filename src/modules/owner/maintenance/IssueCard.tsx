"use client";

import { Trash2, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { ContactButton } from "./ContactButton";
import { StatusMenu } from "./StatusMenu";
import type { Issue, PickStatus, Priority } from "./types";

const PRIORITY: Record<Priority, { pill: string; box: string }> = {
  CRITICAL: { pill: "bg-red-100 text-red-700", box: "bg-red-50 text-red-500" },
  HIGH: { pill: "bg-orange-100 text-orange-700", box: "bg-orange-50 text-orange-500" },
  MEDIUM: { pill: "bg-sky-100 text-sky-700", box: "bg-sky-50 text-sky-500" },
  LOW: { pill: "bg-yellow-100 text-yellow-700", box: "bg-yellow-50 text-yellow-600" },
};

interface Props {
  issue: Issue;
  index: number;
  busy: boolean;
  onStatus: (issue: Issue, to: PickStatus) => void;
  onDelete: (issue: Issue) => void;
}

export function IssueCard({ issue: i, index, busy, onStatus, onDelete }: Props) {
  const t = useTranslations("owner.maintenance");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const p = PRIORITY[i.priority];
  const date = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(i.createdAt));

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: reduce ? 0 : 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -30px 0px" }} exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(index % 4, 3) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/65 p-4 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-16px_rgba(15,23,42,0.3)] motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 gap-4">
        <div className={clsx("relative grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-xl sm:size-20", !i.coverUrl && p.box)}>
          {i.coverUrl
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            ? <img src={i.coverUrl} alt={t("photoAlt", { title: i.title })} loading="lazy" className="size-full object-cover" />
            : <Wrench className="size-8" aria-label={t("noPhoto")} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("rounded-md px-2 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-wide", p.pill)}>{t(`priority.${i.priority}`)}</span>
            <time dateTime={i.createdAt} className="text-xs font-medium text-slate-500">{date}</time>
            <StatusMenu status={i.status} busy={busy} onPick={(s) => onStatus(i, s)} />
          </div>
          <h3 className="mt-1.5 truncate text-[1.02rem] font-bold text-navy" title={i.title}>{i.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{i.description}</p>
          <p className="mt-1.5 truncate text-xs font-semibold text-slate-500">{i.unit.property.name}, {t("unit", { unit: i.unit.unitNumber })}, {i.tenant.fullName}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2.5 sm:flex-col">
        <ContactButton issue={i} />
        <button type="button" onClick={() => onDelete(i)} className="btn h-9 gap-1.5 border border-red-200 bg-red-50 px-3.5 text-[0.82rem] text-red-600 hover:bg-red-100"><Trash2 className="size-4" aria-hidden />{t("delete")}</button>
      </div>
    </motion.li>
  );
}
