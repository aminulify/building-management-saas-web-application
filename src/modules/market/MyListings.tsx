"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, Clock, Eye, Heart, Loader2, Pencil, PackageOpen, RefreshCw, Rocket, Send, Star, Tag, Trash2, Undo2, Zap } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { useRouter } from "@/i18n/navigation";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber, formatTaka, timeAgo } from "../owner/dashboard/format";
import { useArea } from "../find-home/area";
import { BoostPanel } from "./boost/BoostPanel";
import type { ListingBoostInfo } from "./boost/types";

export interface MyListing {
  id: string; type: "RENT" | "SALE"; category: string; title: string; price: string; status: string; rejectionReason: string | null;
  createdAt: string; coverUrl: string | null; photos: number; saves: number; visitRequests: number;
  /** the latest paid Boost of this listing (null = never boosted) */
  boost?: ListingBoostInfo | null;
}

const TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600", PENDING: "bg-amber-50 text-amber-700", PUBLISHED: "bg-emerald-50 text-emerald-700", REJECTED: "bg-red-50 text-red-700",
  SOLD: "bg-sky-50 text-sky-700", ARCHIVED: "bg-slate-100 text-slate-500", EXPIRED: "bg-orange-50 text-orange-700", SUSPENDED: "bg-red-50 text-red-700",
};

interface Props { open: boolean; onClose: () => void; onEdit: (id: string, kind: "FLAT" | "LAND") => void; onView: (id: string) => void; onChanged: () => void }

export function MyListingsModal({ open, onClose, onEdit, onView, onChanged }: Props) {
  return <Modal open={open} onClose={onClose} labelledBy="mk-mine-title" maxWidth="max-w-[760px]">{open && <Body onClose={onClose} onEdit={onEdit} onView={onView} onChanged={onChanged} />}</Modal>;
}

function Body({ onClose, onEdit, onView, onChanged }: Omit<Props, "open">) {
  const t = useTranslations("owner.marketplace.mine");
  const f = useTranslations("owner.findHome");
  const locale = useLocale();
  const toast = useToast();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const q = useAuthQuery<{ items: MyListing[] }>("/me/listings?limit=50");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; what: "delete" | "sold" } | null>(null);
  const [boosting, setBoosting] = useState<MyListing | null>(null);
  const router = useRouter();
  const area = useArea();
  const rows = (q.data?.items ?? []).filter((l) => l.type === "SALE");

  async function act(id: string, key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(`${id}:${key}`); setConfirm(null);
    try { await fn(); toast("success", t(`toast.${done}`)); q.reload(); onChanged(); }
    catch { toast("error", t("toast.error")); } finally { setBusy(null); }
  }
  const post = (id: string, path: string) => () => authApi(`/listings/${id}/${path}`, { method: "POST" });
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-slate-300 disabled:opacity-50 motion-reduce:hover:translate-y-0";

  if (boosting) return <BoostPanel title={boosting.title} price={boosting.price} onBack={() => setBoosting(null)} onConfirm={() => { onClose(); router.push(`${area}/marketplace/boost/${boosting.id}` as never); }} />;

  return (
    <div>
      <h2 id="mk-mine-title" className="mb-1 pr-10 text-lg font-bold text-navy">{t("title")}</h2>
      <p className="mb-4 text-sm text-slate-600">{t("subtitle")}</p>
      {q.state === "loading" && <div aria-busy="true" className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 w-full rounded-xl" />)}</div>}
      {q.state === "error" && (
        <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{f("states.retry")}</button></div>
      )}
      {q.state === "ready" && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center"><PackageOpen className="size-10 text-slate-300" aria-hidden /><p className="font-bold text-navy">{t("emptyTitle")}</p><p className="max-w-xs text-sm text-slate-600">{t("emptyText")}</p></div>
      )}
      <ul className="space-y-3">
        {rows.map((l) => {
          const kind = l.category === "LAND" ? "LAND" : "FLAT";
          const working = busy?.startsWith(l.id);
          const editable = ["DRAFT", "REJECTED", "PUBLISHED"].includes(l.status);
          return (
            <li key={l.id} className="rounded-xl border border-slate-200 bg-white/80 p-3">
              <div className="flex gap-3">
                <button type="button" onClick={() => l.status === "PUBLISHED" && onView(l.id)} className="size-20 shrink-0 overflow-hidden rounded-lg bg-slate-100" aria-label={l.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                  {l.coverUrl && <img src={l.coverUrl} alt="" loading="lazy" className="size-full object-cover" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-bold text-navy">{l.title}</p>
                    <span className={clsx("rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold", TONE[l.status] ?? TONE.DRAFT)}>{t(`status.${l.status}`)}</span>
                    {l.boost?.state === "ACTIVE" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-0.5 text-[0.68rem] font-bold text-white"><Star className="size-3 fill-current" aria-hidden />{t("boost.boosted", { date: l.boost.endsAt ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short" }).format(new Date(l.boost.endsAt)) : "" })}</span>}
                  </div>
                  <p className="mt-0.5 text-sm font-extrabold text-[#0A84F0]">{taka(Number(l.price))}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                    <span>{f(`category.${l.category}`)}</span><span>{timeAgo(locale, l.createdAt)}</span>
                    <span className="inline-flex items-center gap-1"><Heart className="size-3" aria-hidden />{n(l.saves)}</span>
                    <span className="inline-flex items-center gap-1"><Eye className="size-3" aria-hidden />{t("visits", { n: l.visitRequests })}</span>
                  </p>
                  {l.status === "REJECTED" && l.rejectionReason && <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{t("reason", { text: l.rejectionReason })}</p>}
                  {l.status === "PENDING" && <p className="mt-1 text-xs text-amber-700">{t("pendingNote")}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirm?.id === l.id ? (
                  <>
                    <span className="text-xs font-semibold text-navy">{t(confirm.what === "delete" ? "confirmDelete" : "confirmSold")}</span>
                    <button type="button" className={clsx(btn, "!border-red-200 !text-red-600")} onClick={() => confirm.what === "delete" ? act(l.id, "delete", () => authApi(`/listings/${l.id}`, { method: "DELETE" }), "deleted") : act(l.id, "sold", post(l.id, "mark-sold"), "sold")}>{t("yes")}</button>
                    <button type="button" className={btn} onClick={() => setConfirm(null)}>{t("no")}</button>
                  </>
                ) : (
                  <>
                    {editable && <button type="button" className={btn} onClick={() => { onClose(); onEdit(l.id, kind); }}><Pencil className="size-3.5" aria-hidden />{t("edit")}</button>}
                    {(l.status === "DRAFT" || l.status === "REJECTED") && <button type="button" disabled={working} className={clsx(btn, "!border-transparent bg-brand-gradient !text-white")} onClick={() => act(l.id, "submit", post(l.id, "submit"), "submitted")}>{busy === `${l.id}:submit` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}{t("publish")}</button>}
                    {l.status === "PUBLISHED" && l.boost?.state !== "ACTIVE" && (l.boost?.state === "PENDING"
                      ? <button type="button" className={clsx(btn, "!border-amber-200 !text-amber-700")} onClick={() => { onClose(); router.push(`${area}/marketplace/boost/${l.id}` as never); }}><Clock className="size-3.5" aria-hidden />{t("boost.inReview")}</button>
                      : <button type="button" className={clsx(btn, "!border-transparent bg-gradient-to-r from-amber-400 to-fuchsia-500 !text-white")} onClick={() => setBoosting(l)}><Zap className="size-3.5" aria-hidden />{t("boost.button")}</button>)}
                    {l.status === "PUBLISHED" && <button type="button" className={btn} onClick={() => setConfirm({ id: l.id, what: "sold" })}><Tag className="size-3.5" aria-hidden />{t("markSold")}</button>}
                    {l.status === "EXPIRED" && <button type="button" disabled={working} className={btn} onClick={() => act(l.id, "renew", post(l.id, "renew"), "renewed")}><Rocket className="size-3.5" aria-hidden />{t("renew")}</button>}
                    {(l.status === "PUBLISHED" || l.status === "PENDING") && <button type="button" disabled={working} className={btn} onClick={() => act(l.id, "deactivate", post(l.id, "deactivate"), "deactivated")}><Undo2 className="size-3.5" aria-hidden />{t("deactivate")}</button>}
                    {l.status === "PUBLISHED" && <button type="button" className={btn} onClick={() => onView(l.id)}><BadgeCheck className="size-3.5" aria-hidden />{t("view")}</button>}
                    {l.status !== "SUSPENDED" ? <button type="button" disabled={working} className={clsx(btn, "ml-auto !text-red-600")} onClick={() => setConfirm({ id: l.id, what: "delete" })}><Trash2 className="size-3.5" aria-hidden />{t("delete")}</button> : null}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
