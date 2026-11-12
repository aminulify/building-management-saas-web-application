"use client";

import { Bell, CheckCheck, Clock, ExternalLink, Hash, Info, Tag } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useRouter } from "@/i18n/navigation";
import { detailRows, groupOf, humanize, MONEY_KEYS, shortRef } from "./details";

export interface DetailsItem {
  id: string; type: string; titleKey: string; params: Record<string, unknown>; link?: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL"; readAt: string | null; createdAt: string;
}

interface Props {
  item: DetailsItem | null;
  /** the notification text exactly as the card shows it */
  headline: string; body: string;
  /** "5 minutes ago" as the card shows it */
  ago: string;
  onClose: () => void;
  onRead?: (id: string) => void;
}

const PRIORITY: Record<DetailsItem["priority"], string> = { LOW: "bg-slate-100 text-slate-600", NORMAL: "bg-sky-100 text-sky-700", HIGH: "bg-amber-100 text-amber-700", CRITICAL: "bg-red-100 text-red-700" };

/** "Details" of one notification: the message, when it arrived, what kind it is, its facts, and a button to the page it is about. Used by every notification centre. */
export function NotificationDetailsModal({ item, headline, body, ago, onClose, onRead }: Props) {
  return (
    <Modal open={!!item} onClose={onClose} labelledBy="nd-title" maxWidth="max-w-[560px]">
      {item && <Body item={item} headline={headline} body={body} ago={ago} onClose={onClose} onRead={onRead} />}
    </Modal>
  );
}

function Body({ item, headline, body, ago, onClose, onRead }: Omit<Props, "item"> & { item: DetailsItem }) {
  const t = useTranslations("notificationDetails");
  const owner = useTranslations("owner.notifications");
  const locale = useLocale();
  const router = useRouter();
  const tag = locale === "bn" ? "bn-BD" : "en-GB";
  const when = (iso: string) => new Intl.DateTimeFormat(tag, { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const money = (v: string | number) => `৳${new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 2 }).format(Number(v))}`;
  const rows = detailRows(item.params);
  const group = groupOf(item.type);
  const unread = !item.readAt;

  const show = (key: string, v: string | number) => {
    if (MONEY_KEYS.includes(key)) return money(v);
    if (key === "month" && /^\d{4}-\d{2}/.test(String(v))) return new Intl.DateTimeFormat(tag, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${String(v).slice(0, 7)}-01T00:00:00Z`));
    if ((key === "alertType" || key === "type") && owner.has(`sosTypes.${v}` as never)) return owner(`sosTypes.${v}` as never);
    if (key === "status" || key === "action") return typeof v === "string" ? humanize(v) : String(v);
    return String(v);
  };

  const cell = "rounded-xl border border-white/70 bg-slate-50/80 p-3";
  const label = "flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-wider text-slate-500";

  return (
    <div>
      <header className="flex items-start gap-3 pr-10">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-[0_8px_20px_-8px_rgba(244,19,230,0.6)]"><Bell className="size-6" /></span>
        <div className="min-w-0">
          <h2 id="nd-title" className="text-lg font-bold leading-snug text-navy sm:text-xl">{headline || t("untitled")}</h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[0.68rem] font-bold text-sky-700">{t(`groups.${group}`)}</span>
            <span className={clsx("rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold", PRIORITY[item.priority])}>{t(`priority.${item.priority}`)}</span>
            <span className={clsx("rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold", unread ? "bg-fuchsia-100 text-fuchsia-700" : "bg-emerald-100 text-emerald-700")}>{t(unread ? "unread" : "read")}</span>
          </p>
        </div>
      </header>

      {body && <p className="mt-4 rounded-xl border border-white/70 bg-white/70 p-4 text-[0.95rem] leading-relaxed text-slate-700">{body}</p>}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={cell}><dt className={label}><Clock className="size-3.5" aria-hidden />{t("received")}</dt><dd className="mt-1 text-sm font-semibold text-navy">{when(item.createdAt)}</dd><dd className="text-xs text-slate-500">{ago}</dd></div>
        <div className={cell}><dt className={label}><Hash className="size-3.5" aria-hidden />{t("reference")}</dt><dd className="mt-1 font-mono text-sm font-semibold text-navy">#{shortRef(item.id)}</dd>{item.readAt && <dd className="text-xs text-slate-500">{t("readAt", { when: when(item.readAt) })}</dd>}</div>
      </dl>

      <section aria-label={t("facts")} className="mt-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy"><Info className="size-4 text-[#0A84F0]" aria-hidden />{t("facts")}</h3>
        {rows.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">{t("noFacts")}</p> : (
          <dl className="divide-y divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 bg-white/70">
            {rows.map((r) => (
              <div key={r.key} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm"><dt className="flex shrink-0 items-center gap-1.5 text-slate-500"><Tag className="size-3.5" aria-hidden />{t(`fields.${r.key}`)}</dt><dd className="min-w-0 break-words text-right font-semibold text-navy">{show(r.key, r.value)}</dd></div>
            ))}
          </dl>
        )}
      </section>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={onClose} className="btn btn-white h-11 px-6 text-sm">{t("close")}</button>
        <div className="flex flex-col gap-3 sm:flex-row">
          {unread && onRead && <button type="button" onClick={() => onRead(item.id)} className="btn btn-white h-11 px-5 text-sm"><CheckCheck className="size-4" aria-hidden />{t("markRead")}</button>}
          {item.link && <button type="button" data-autofocus onClick={() => { onClose(); router.push(item.link as never); }} className="btn btn-primary h-11 px-5 text-sm"><ExternalLink className="size-4" aria-hidden />{t("open")}</button>}
        </div>
      </div>
    </div>
  );
}
