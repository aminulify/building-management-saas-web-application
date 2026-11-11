"use client";

import { CalendarClock, Pencil, Trash2, Wrench } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { canEdit } from "./logic";
import { PRIORITY_STYLE } from "./PriorityPills";
import type { Issue, IssueStatus } from "./types";

const STATUS: Record<IssueStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  APPROVED: "bg-sky-100 text-sky-700",
  IN_PROGRESS: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

interface Props { issue: Issue; index: number; onEdit: (i: Issue) => void; onDelete: (i: Issue) => void }

/** One request: photo, priority, date, condition, words, where it is filed, and Edit / Delete. */
export function RequestCard({ issue: i, index, onEdit, onDelete }: Props) {
  const t = useTranslations("tenant.maintenance");
  const o = useTranslations("owner.maintenance");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const p = PRIORITY_STYLE[i.priority];
  const lang = locale === "bn" ? "bn-BD" : "en-US";
  const date = new Intl.DateTimeFormat(lang, { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Dhaka" }).format(new Date(i.createdAt));
  const when = i.preferredAt ? new Intl.DateTimeFormat(lang, { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" }).format(new Date(i.preferredAt)) : null;

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: reduce ? 0 : 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -30px 0px" }} exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(index % 5, 4) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/65 p-4 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-16px_rgba(15,23,42,0.3)] motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 gap-4">
        <div className={clsx("relative grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-xl sm:size-20", !i.coverUrl && p.box)}>
          {i.coverUrl
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL or a local preview
            ? <img src={i.coverUrl} alt={o("photoAlt", { title: i.title })} loading="lazy" className="size-full object-cover" />
            : <Wrench className="size-8" aria-label={o("noPhoto")} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx("rounded-md px-2 py-0.5 text-[0.68rem] font-extrabold uppercase tracking-wide", p.pill)}>{o(`priority.${i.priority}`)}</span>
            <time dateTime={i.createdAt} className="text-xs font-medium text-slate-500">{date}</time>
            <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS[i.status])}><span aria-hidden className="size-1.5 rounded-full bg-current" />{o(`status.${i.status}`)}</span>
          </div>
          <h3 className="mt-1.5 truncate text-[1.02rem] font-bold text-navy" title={i.title}>{i.title}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{i.description}</p>
          <p className="mt-1.5 truncate text-xs font-semibold text-slate-500">{i.unit.property.name}, {o("unit", { unit: i.unit.unitNumber })}, {i.tenant.fullName}</p>
          {when && <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#0A84F0]"><CalendarClock className="size-3.5" aria-hidden />{t("card.preferred", { when })}</p>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2.5 sm:flex-col">
        <button type="button" onClick={() => onEdit(i)} disabled={!canEdit(i.status)} title={canEdit(i.status) ? undefined : t("card.closed")} className="btn btn-white h-9 gap-1.5 px-3.5 text-[0.82rem]"><Pencil className="size-4" aria-hidden />{t("card.edit")}</button>
        <button type="button" onClick={() => onDelete(i)} className="btn h-9 gap-1.5 border border-red-200 bg-red-50 px-3.5 text-[0.82rem] text-red-600 hover:bg-red-100"><Trash2 className="size-4" aria-hidden />{o("delete")}</button>
      </div>
    </motion.li>
  );
}
