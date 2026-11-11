"use client";

import { useState } from "react";
import { AlertTriangle, CalendarRange, FileDown, Home, Loader2, Mail, MessageSquare, Phone, RefreshCw, Repeat2, Users, IdCard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { CountUp } from "@/components/motion/CountUp";
import { useRouter } from "@/i18n/navigation";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { formatNumber, formatPercent, formatTaka } from "../dashboard/format";
import { formatDate, formatPhone } from "../tenants/format";
import { Avatar } from "../units/TenantPicker";
import { BehaviorBadge } from "./BehaviorBadge";
import { LedgerTable } from "./LedgerTable";
import { stayDuration } from "./logic";
import { downloadStatementPdf } from "./statement-pdf";
import type { PastDetail, PastRow } from "./types";

interface Props { row: PastRow | null; onClose: () => void; onReassign: (d: PastDetail) => void }

/** Complete tenant history: who they are, how long they stayed, every month of rent and the money summary. */
export function HistoryModal({ row, onClose, onReassign }: Props) {
  return (
    <Modal open={row !== null} onClose={onClose} labelledBy="history-title" maxWidth="max-w-[720px]">
      {row && <Body row={row} onClose={onClose} onReassign={onReassign} />}
    </Modal>
  );
}

function Fact({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return <div className="flex items-start gap-2.5"><Icon className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-label">{label}</p><p className="break-words text-sm font-semibold text-navy">{children}</p></div></div>;
}

function Body({ row, onClose, onReassign }: { row: PastRow; onClose: () => void; onReassign: (d: PastDetail) => void }) {
  const t = useTranslations("owner.previousTenants.history");
  const rt = useTranslations("owner.previousTenants");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const taka = formatTaka(locale);
  const num = formatNumber(locale);
  const q = useAuthQuery<PastDetail>(`/tenancies/${row.id}/history`);
  const [busy, setBusy] = useState<"pdf" | "msg" | null>(null);
  const d = q.data;

  const stay = d ? stayDuration(d.startDate, d.endDate) : null;
  const stayText = stay ? [stay.years ? t("years", { n: stay.years }) : "", stay.months ? t("months", { n: stay.months }) : "", stay.days || (!stay.years && !stay.months) ? t("days", { n: stay.days }) : ""].filter(Boolean).join(" ") : "";

  async function pdf() {
    if (!d) return;
    setBusy("pdf");
    try { await downloadStatementPdf(d); toast("success", t("pdfDone")); } catch { toast("error", t("pdfError")); }
    setBusy(null);
  }
  async function message() {
    if (!d?.tenant || !d.canMessage) return;
    setBusy("msg");
    try {
      const c = await authApi<{ id: string }>("/conversations", { method: "POST", body: { type: "DIRECT", recipientId: d.tenant.id } });
      onClose();
      router.push(`/owner/messages?c=${c.id}` as never);
    } catch (e) { toast("error", t(e instanceof ApiError && e.code === "FORBIDDEN" ? "messageForbidden" : "messageError")); setBusy(null); }
  }

  return (
    <div>
      <h2 id="history-title" className="sr-only">{t("title")}</h2>
      {q.state === "loading" && <div aria-busy="true" className="space-y-4"><span className="sr-only">{t("loading")}</span><div className="skeleton h-20 w-full rounded-xl" /><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
      {q.state === "error" && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-10 text-center text-red-700">
          <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
          <button type="button" onClick={q.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
        </div>
      )}
      {q.state === "ready" && d && (
        <>
          <header className="flex flex-wrap items-center gap-4 pr-10">
            <Avatar name={d.tenant?.fullName ?? "?"} url={d.tenant?.avatarUrl} size="size-16" />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold leading-tight text-navy sm:text-2xl">{d.tenant?.fullName ?? "—"}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2"><BehaviorBadge value={d.behavior} />{d.terminated && <span className="rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">{t("terminated")}</span>}</div>
            </div>
          </header>

          <section aria-label={t("profile")} className="mt-4 grid gap-3 rounded-xl border border-white/70 bg-white/60 p-4 backdrop-blur-md sm:grid-cols-2">
            <Fact icon={Phone} label={t("phone")}>{formatPhone(d.tenant?.phone)}</Fact>
            <Fact icon={Mail} label={t("email")}>{d.tenant?.email ?? "—"}</Fact>
            <Fact icon={IdCard} label={t("nid")}>{d.tenant?.nid ?? "—"}</Fact>
            <Fact icon={Users} label={t("family")}>{t("people", { n: num(d.members) })}</Fact>
          </section>

          <section aria-label={t("residency")} className="mt-4 grid gap-3 rounded-xl border border-white/70 bg-white/60 p-4 backdrop-blur-md sm:grid-cols-2">
            <Fact icon={Home} label={t("place")}>{d.property.name} · {rt("unit", { no: d.unit.unitNumber })}</Fact>
            <Fact icon={CalendarRange} label={t("stay")}>{stayText}</Fact>
            <Fact icon={CalendarRange} label={t("moveIn")}>{formatDate(locale, d.startDate)}</Fact>
            <Fact icon={CalendarRange} label={t("moveOut")}>{formatDate(locale, d.endDate)}</Fact>
            <div className="sm:col-span-2"><Fact icon={Home} label={t("reason")}>{d.leaveReason ? rt(`reason.${d.leaveReason}`) : "—"}</Fact></div>
            {d.ownerNotes && <div className="sm:col-span-2 rounded-lg bg-amber-50/80 px-3 py-2 text-xs text-amber-900"><span className="font-bold">{t("notes")}:</span> {d.ownerNotes}</div>}
          </section>

          <section aria-label={t("ledger")} className="mt-4">
            <h3 className="mb-2 text-sm font-bold text-navy">{t("ledger")}</h3>
            <LedgerTable rows={d.ledger} />
          </section>

          <section aria-label={t("summary")} className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { k: "collected", v: <CountUp value={d.summary.collected} format={taka} />, tone: "text-emerald-600" },
              { k: "onTime", v: d.summary.onTimeRate === null ? "—" : <CountUp value={d.summary.onTimeRate} format={formatPercent(locale)} />, tone: "text-sky-600" },
              { k: "dues", v: <CountUp value={d.summary.dues} format={taka} />, tone: d.summary.dues > 0 ? "text-red-600" : "text-navy" },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-white/70 bg-white/70 p-4 text-center shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-label">{t(`sum.${s.k}`)}</p>
                <p className={`mt-1 text-2xl font-extrabold ${s.tone}`}>{s.v}</p>
              </div>
            ))}
          </section>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <button type="button" onClick={() => void pdf()} disabled={busy !== null} className="btn btn-white h-11 flex-1 px-3 text-sm">{busy === "pdf" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileDown className="size-4" aria-hidden />}{t("pdf")}</button>
            <button type="button" onClick={() => onReassign(d)} disabled={busy !== null || d.hasActiveTenancy} title={d.hasActiveTenancy ? t("reassignBusy") : undefined} className="btn btn-white h-11 flex-1 px-3 text-sm"><Repeat2 className="size-4" aria-hidden />{t("reassign")}</button>
            <button type="button" onClick={() => void message()} disabled={busy !== null || !d.canMessage} title={d.canMessage ? undefined : t("messageOnlyCurrent")} className="btn btn-primary h-11 flex-1 px-3 text-sm">{busy === "msg" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessageSquare className="size-4" aria-hidden />}{t("message")}</button>
          </div>
          {!d.canMessage && <p className="mt-2 text-center text-xs text-label">{t("messageOnlyCurrent")}</p>}
          {d.hasActiveTenancy && <p className="mt-1 text-center text-xs text-label">{t("reassignBusy")}</p>}
        </>
      )}
    </div>
  );
}
