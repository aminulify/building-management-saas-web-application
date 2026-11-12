"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, Trash2, X, Zap } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { taka } from "../manage-home/format";
import { BoostDetails } from "./BoostDetails";
import { BoostEditModal, type EditInput } from "./BoostEditModal";
import { BoostKpis } from "./BoostKpis";
import { BoostSettingsCard } from "./BoostSettingsCard";
import { BoostTable } from "./BoostTable";
import type { BoostRow, BoostStats, BoostTab } from "./types";
import { useBoostPages } from "./use-boost-pages";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Paid Boost: check boost payments, approve or refuse them, watch the running boosts, and set the fee. */
export function PaidBoostView() {
  const t = useTranslations("admin.paidBoost");
  const locale = useLocale();
  const toast = useToast();
  const [tab, setTab] = useState<BoostTab>("all");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const pages = useBoostPages(tab, search);
  const stats = useAuthQuery<BoostStats>("/admin/boosts/stats");
  const [viewing, setViewing] = useState<BoostRow | null>(null);
  const [editing, setEditing] = useState<BoostRow | null>(null);
  const [deleting, setDeleting] = useState<BoostRow | null>(null);
  const [approving, setApproving] = useState<BoostRow | null>(null);
  const [rejecting, setRejecting] = useState<BoostRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);

  const refresh = () => { pages.reload(); stats.reload(); };
  const fail = (e: unknown) => {
    const why = e instanceof ApiError && e.code === "INVALID_STATE" ? (e.details as { reason?: string } | undefined)?.reason : undefined;
    toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : why === "listing_not_live" ? t("toast.notLive") : why === "already_paid" ? t("toast.alreadyPaid") : why === "never_started" ? t("toast.neverStarted") : why === "ends_in_past" ? t("toast.endsInPast") : e instanceof ApiError && e.code === "INVALID_STATE" ? t("toast.alreadyDecided") : t("toast.failed"));
  };

  async function approve() {
    if (!approving) return;
    setBusy(true);
    try { await authApi(`/admin/boosts/${approving.id}/approve`, { method: "POST" }); toast("success", t("toast.approved", { title: approving.listing.title })); setApproving(null); refresh(); }
    catch (e) { fail(e); setApproving(null); refresh(); } finally { setBusy(false); }
  }
  async function save(r: BoostRow, input: EditInput) {
    setBusy(true);
    try { await authApi(`/admin/boosts/${r.id}`, { method: "PATCH", body: input }); toast("success", t("toast.saved", { title: r.listing.title })); setEditing(null); refresh(); }
    catch (e) { fail(e); refresh(); } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try { await authApi(`/admin/boosts/${deleting.id}`, { method: "DELETE" }); toast("success", t("toast.deleted", { title: deleting.listing.title })); setDeleting(null); setEditing(null); refresh(); }
    catch (e) { fail(e); setDeleting(null); refresh(); } finally { setBusy(false); }
  }
  async function reject() {
    if (!rejecting) return;
    if (reason.trim().length < 3) { setReasonError(true); return; }
    setBusy(true);
    try { await authApi(`/admin/boosts/${rejecting.id}/reject`, { method: "POST", body: { reason: reason.trim() } }); toast("success", t("toast.rejected", { title: rejecting.listing.title })); setRejecting(null); setReason(""); refresh(); }
    catch (e) { fail(e); setRejecting(null); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <BoostKpis data={stats.data} state={stats.state} onRetry={stats.reload} />
      <Reveal><BoostSettingsCard /></Reveal>
      <Reveal><BoostTable tab={tab} onTab={setTab} search={text} onSearch={setText} pages={pages} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} onApprove={setApproving} onReject={(b) => { setRejecting(b); setReason(""); setReasonError(false); }} /></Reveal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} labelledBy="pb-view" maxWidth="max-w-[680px]">
        {viewing && (
          <div>
            <h2 id="pb-view" className="pr-10 text-xl font-bold text-navy">{t("viewModal.title")}</h2>
            <div className="mt-4"><BoostDetails r={viewing} /></div>
            <div className="mt-6 flex justify-end"><button type="button" data-autofocus onClick={() => setViewing(null)} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>
          </div>
        )}
      </Modal>
      <BoostEditModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} onDelete={setDeleting} />

      <Modal open={!!deleting} onClose={() => !busy && setDeleting(null)} labelledBy="pb-delete" busy={busy} maxWidth="max-w-[460px]">
        {deleting && (
          <div className="text-center">
            <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full border-2 border-red-300 bg-red-100 text-red-600"><Trash2 className="size-6" /></span>
            <h2 id="pb-delete" className="mt-3 text-2xl font-bold text-navy">{t("deleteModal.title")}</h2>
            <p className="mt-2 text-sm text-slate-600">{t("deleteModal.text", { title: deleting.listing.title })}</p>
            {deleting.state === "ACTIVE" && <p className="mt-2 text-xs font-medium text-amber-700">{t("deleteModal.activeNote")}</p>}
            <p className="mt-2 text-xs text-slate-500">{t("deleteModal.note")}</p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <button type="button" data-autofocus onClick={() => setDeleting(null)} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
              <button type="button" onClick={() => void remove()} disabled={busy} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-44">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}{busy ? t("working") : t("deleteModal.yes")}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!approving} onClose={() => !busy && setApproving(null)} labelledBy="pb-approve" busy={busy} maxWidth="max-w-[460px]">
        {approving && (
          <div className="text-center">
            <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full border-2 border-emerald-300 bg-emerald-100 text-emerald-600"><Zap className="size-6" /></span>
            <h2 id="pb-approve" className="mt-3 text-2xl font-bold text-navy">{t("approveModal.title")}</h2>
            <p className="mt-2 text-sm text-slate-600">{t("approveModal.text", { title: approving.listing.title, days: approving.durationDays })}</p>
            <dl className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-left text-sm"><div className="flex justify-between"><dt className="text-slate-500">{t("approveModal.amount")}</dt><dd className="font-bold text-navy">{taka(locale, approving.amount)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">{t("approveModal.trx")}</dt><dd className="font-mono font-bold text-navy">{approving.trxId}</dd></div><div className="flex justify-between"><dt className="text-slate-500">{t("approveModal.sender")}</dt><dd className="font-bold text-navy" dir="ltr">{approving.senderNumber}</dd></div></dl>
            <p className="mt-2 text-xs text-slate-500">{t("approveModal.note")}</p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
              <button type="button" data-autofocus onClick={() => setApproving(null)} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
              <button type="button" onClick={() => void approve()} disabled={busy} aria-busy={busy || undefined} className="btn btn-primary h-12 sm:min-w-44">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{busy ? t("working") : t("approveModal.yes")}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!rejecting} onClose={() => !busy && setRejecting(null)} labelledBy="pb-reject" busy={busy} maxWidth="max-w-[480px]">
        {rejecting && (
          <div>
            <h2 id="pb-reject" className="pr-10 text-xl font-bold text-navy">{t("rejectModal.title")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("rejectModal.text", { title: rejecting.listing.title })}</p>
            <label htmlFor="pb-reason" className="mt-4 block text-xs font-bold uppercase tracking-wider text-label">{t("rejectModal.reason")}</label>
            <textarea id="pb-reason" rows={3} maxLength={300} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(false); }} placeholder={t("rejectModal.placeholder")} className="glass-input mt-2 w-full resize-none rounded-lg p-3 text-sm text-navy outline-none" data-invalid={reasonError || undefined} aria-invalid={reasonError || undefined} />
            {reasonError && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600"><AlertCircle className="size-3.5" aria-hidden />{t("rejectModal.required")}</p>}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button type="button" onClick={() => setRejecting(null)} disabled={busy} className="btn btn-white h-12 sm:min-w-32">{t("cancel")}</button>
              <button type="button" onClick={() => void reject()} disabled={busy} aria-busy={busy || undefined} className="btn btn-danger h-12 sm:min-w-44">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}{busy ? t("working") : t("rejectModal.yes")}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
