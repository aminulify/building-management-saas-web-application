"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, BadgeCheck, Check, FileText, Flag, History, Loader2, Mail, MapPin, MessageCircle, Phone, RefreshCw, ShieldCheck, ShieldQuestion, ShieldX, UserRound, X } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { day } from "../../admin/manage-home/format";
import { AMENITY_CODES } from "../../admin/properties/amenities";
import { StateBadge } from "./GovTable";
import type { GovDetails, PropertyRow, Verification } from "./types";

const eventKey = (a: string) => a.replace(/[.\-]/g, "_");
const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
const VERIFY: Record<Verification, { style: string; icon: typeof ShieldCheck }> = {
  VERIFIED: { style: "bg-emerald-100 text-emerald-700", icon: ShieldCheck }, PENDING: { style: "bg-amber-100 text-amber-700", icon: ShieldQuestion },
  UNVERIFIED: { style: "bg-slate-200 text-slate-600", icon: ShieldQuestion }, REJECTED: { style: "bg-red-100 text-red-700", icon: ShieldX },
};
const UNIT_STYLE: Record<string, string> = { OCCUPIED: "border-emerald-300 bg-emerald-50 text-emerald-800", AVAILABLE: "border-sky-300 bg-sky-50 text-sky-800", MAINTENANCE: "border-amber-300 bg-amber-50 text-amber-800" };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className={h}>{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

function Body({ d, onMessage, onReported }: { d: GovDetails; onMessage: () => void; onReported: () => void }) {
  const t = useTranslations("gov.properties.details");
  const tr = useTranslations("gov.roles");
  const ta = useTranslations("admin.properties");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const v = VERIFY[d.verification.status];
  const VIcon = v.icon;
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const floors = [...new Set(d.units.map((u) => u.floor))].sort((a, b) => b - a);
  const rate = Math.min(100, Math.max(0, d.occupancy.rate));

  async function report(e: React.FormEvent) {
    e.preventDefault();
    if (notes.trim().length < 3) { setProblem(t("report.short")); return; }
    setBusy(true); setProblem(null);
    try { await authApi(`/gov/properties/${d.id}/report`, { method: "POST", body: { notes: notes.trim() } }); toast("success", t("report.sent", { name: d.name })); setNotes(""); onReported(); }
    catch (err) { setProblem(err instanceof ApiError && err.code === "NOT_FOUND" ? t("report.gone") : t("report.failed")); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
        <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sky-100 text-[#0A84F0]"><BadgeCheck className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{d.name}</h3>
          <p className="text-xs font-semibold text-slate-500">{ta(`types.${d.type}` as never)}</p>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.location || t("none")}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", v.style)}><VIcon className="size-4" aria-hidden />{t(`verify.${d.verification.status}`)}</span>
          {(d.state === "REJECTED" || d.state === "SUSPENDED") && <StateBadge state={d.state} />}
        </div>
      </div>

      {d.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {d.photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt={t("photo", { n: i + 1 })} className="h-32 w-52 shrink-0 rounded-xl border border-white object-cover shadow-sm" />
          ))}
        </div>
      )}

      <section aria-label={t("owner")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><UserRound className="size-3.5" aria-hidden />{t("owner")}</h3>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <dl className="grid flex-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Fact label={t("ownerName")}>{d.owner.fullName}</Fact>
            <Fact label={t("ownerId")}>{d.owner.ownerCode ?? t("none")}</Fact>
            <Fact label={t("phone")}><span className="flex items-center gap-1.5"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.owner.phone)}</span></span></Fact>
            <Fact label={t("email")}><span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden />{d.owner.email ?? t("none")}</span></Fact>
            <Fact label={t("ownerNid")}><span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY[d.owner.verificationStatus].style)}>{t(`nid.${d.owner.verificationStatus}`)}</span></Fact>
            <Fact label={t("joined")}>{d.owner.joinedAt ? day(locale, d.owner.joinedAt) : t("none")}</Fact>
          </dl>
          <button type="button" onClick={onMessage} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
        </div>
      </section>

      <section aria-label={t("occupancy")} className={card}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={h}>{t("occupancy")}</h3>
          <p className="text-2xl font-bold text-[#9333EA]">{new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN", { maximumFractionDigits: 1 }).format(rate)}%</p>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200/80" role="progressbar" aria-valuenow={Math.round(rate)} aria-valuemin={0} aria-valuemax={100} aria-label={t("occupancy")}>
          <motion.div className="h-full rounded-full bg-gradient-to-r from-[#9333EA] to-[#0A84F0]" initial={{ width: reduce ? `${rate}%` : 0 }} animate={{ width: `${rate}%` }} transition={{ duration: reduce ? 0 : 0.6 }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {([[t("unitsTotal"), d.occupancy.totalUnits, "text-navy"], [t("unitsOccupied"), d.occupancy.occupiedUnits, "text-emerald-700"], [t("unitsVacant"), d.occupancy.vacantUnits, "text-sky-700"]] as [string, number, string][]).map(([label, n, tone]) => (
            <div key={label} className="rounded-lg bg-white/70 p-2.5"><p className={clsx("text-2xl font-bold", tone)}>{num(n)}</p><p className="text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">{label}</p></div>
          ))}
        </div>
      </section>

      <section aria-label={t("matrix")} className={card}>
        <h3 className={h}>{t("matrix")}</h3>
        {d.units.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noUnits")}</p> : (
          <div className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
            {floors.map((f) => (
              <div key={f} className="flex gap-3 rounded-lg bg-white/70 p-2">
                <p className="w-16 shrink-0 pt-1 text-xs font-bold text-slate-500">{t("floor", { n: num(f) })}</p>
                <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {d.units.filter((u) => u.floor === f).map((u) => (
                    <li key={u.id} title={`${u.unitNumber} · ${t(`avail.${u.availability}` as never)}`} className={clsx("rounded-lg border px-2.5 py-1 text-xs font-bold", UNIT_STYLE[u.availability] ?? "border-slate-200 bg-slate-50 text-slate-600")}>{u.unitNumber}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="flex flex-wrap gap-3 text-[0.7rem] text-slate-500"><span className="inline-flex items-center gap-1"><i className="size-2.5 rounded bg-emerald-400" />{t("avail.OCCUPIED")}</span><span className="inline-flex items-center gap-1"><i className="size-2.5 rounded bg-sky-400" />{t("avail.AVAILABLE")}</span><span className="inline-flex items-center gap-1"><i className="size-2.5 rounded bg-amber-400" />{t("avail.MAINTENANCE")}</span></p>
          </div>
        )}
      </section>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={t("floors")}>{num(d.totalFloors)}{d.sqft ? ` · ${t("sqft", { n: num(d.sqft) })}` : ""}</Fact>
        <Fact label={t("added")}>{day(locale, d.createdAt)}</Fact>
        {d.description && <div className="sm:col-span-2"><Fact label={t("description")}><span className="whitespace-pre-line">{d.description}</span></Fact></div>}
        <div className="sm:col-span-2"><dt className={h}>{t("amenities")}</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {AMENITY_CODES.map((a) => { const has = d.amenities.includes(a); return <span key={a} className={clsx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", has ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-400 line-through")}>{has ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}{ta(`amenity.${a}` as never)}</span>; })}
          </dd>
        </div>
      </dl>

      <section aria-label={t("verification")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><FileText className="size-3.5" aria-hidden />{t("verification")}</h3>
        <p className="mt-1 text-sm text-slate-700">{d.verification.reviewedAt ? t("reviewed", { date: when(d.verification.reviewedAt) }) : t("notReviewed")}{d.verification.notes && <span className="mt-0.5 block text-xs text-slate-600">“{d.verification.notes}”</span>}</p>
        {d.documents.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noDocs")}</p> : (
          <ul className="mt-2 space-y-1.5">{d.documents.map((x) => <li key={x.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm"><span className="font-semibold text-navy">{t(`docKind.${x.kind}` as never)} <span className="text-xs font-medium text-slate-500">· {day(locale, x.createdAt)}</span></span><span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY[x.status].style)}>{t(`verify.${x.status}`)}</span></li>)}</ul>
        )}
      </section>

      <section aria-label={t("audit")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><History className="size-3.5" aria-hidden />{t("audit")} · {num(d.audit.length)}</h3>
        {d.audit.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noAudit")}</p> : (
          <ol className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
            {d.audit.map((l) => (
              <li key={l.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs">
                <p className="flex flex-wrap items-center gap-x-2"><span className="font-bold text-navy">{t.has(`event.${eventKey(l.action)}` as never) ? t(`event.${eventKey(l.action)}` as never) : l.action}</span><span className="text-slate-500">· {when(l.at)}</span></p>
                {l.by && <p className="text-slate-500">{t("by", { name: l.by.name, role: tr(l.by.role as never) })}</p>}
                {(l.notes || l.reason) && <p className="mt-0.5 break-words text-slate-700">“{l.notes ?? l.reason}”</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <form onSubmit={report} className={clsx(card, "space-y-2 border-amber-200/80 bg-amber-50/40")}>
        <h3 className={clsx(h, "flex items-center gap-1.5 text-amber-800")}><Flag className="size-3.5" aria-hidden />{t("report.title")}{d.issueReports > 0 && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[0.65rem] font-bold text-amber-900">{t("report.count", { n: num(d.issueReports) })}</span>}</h3>
        <p className="text-xs text-slate-600">{t("report.hint")}</p>
        <label htmlFor="gp-report" className="sr-only">{t("report.label")}</label>
        <textarea id="gp-report" value={notes} onChange={(e) => { setNotes(e.target.value); setProblem(null); }} maxLength={500} rows={2} disabled={busy} placeholder={t("report.placeholder")} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-navy outline-none placeholder:text-slate-400" />
        {problem && <p role="alert" className="text-sm font-semibold text-red-600">{problem}</p>}
        <div className="flex justify-end"><button type="submit" disabled={busy} aria-busy={busy || undefined} className="btn btn-white h-10 px-4 text-sm">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Flag className="size-4" aria-hidden />}{busy ? t("report.sending") : t("report.send")}</button></div>
      </form>
    </div>
  );
}

interface Props { row: PropertyRow | null; onClose: () => void; onMessage: (o: { id: string; fullName: string; avatarUrl: string | null }) => void }

/** View Property Details (about 850px): asset, address, verification badge, owner profile, occupancy, unit matrix, documents, audit trail and Report Issue. */
export function GovPropertyModal({ row, onClose, onMessage }: Props) {
  const t = useTranslations("gov.properties.details");
  const [d, setD] = useState<GovDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "gone">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!row) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<GovDetails>(`/gov/properties/${row.id}/overview`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch((e) => { if (live) setState(e instanceof ApiError && e.code === "NOT_FOUND" ? "gone" : "error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <Modal open={!!row} onClose={onClose} labelledBy="gp-view" maxWidth="max-w-[850px]">
      {row && (
        <div>
          <h2 id="gp-view" className="pr-10 text-xl font-bold text-navy">{t("title")}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><span className="sr-only">{t("loading")}</span><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-32 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {(state === "error" || state === "gone") && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{state === "gone" ? t("gone") : t("error")}</p>
              {state === "error" && <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>}</div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={() => onMessage({ id: d.owner.id, fullName: d.owner.fullName, avatarUrl: null })} onReported={() => setTick((n) => n + 1)} /></div>}
          <div className="mt-5 flex justify-end border-t border-slate-200/70 pt-4"><button type="button" data-autofocus onClick={onClose} className="btn btn-white h-12 sm:min-w-28">{t("close")}</button></div>
        </div>
      )}
    </Modal>
  );
}
