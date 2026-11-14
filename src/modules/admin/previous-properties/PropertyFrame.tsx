"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, CalendarX2, History, Mail, MapPin, MessageCircle, Phone, RefreshCw, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { authApi } from "@/lib/auth-client";
import { formatPhone } from "../../owner/tenants/format";
import { taka, day } from "../manage-home/format";
import { StatusBadge } from "./PreviousTable";
import type { ArchiveDetails, ArchiveRow, ArchiveUnit } from "./types";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold text-navy">{children}</dd></div>;
}

/** Unit Matrix: one row per floor, one tile per unit. The state shown is the unit's state in the archive. */
function UnitMatrix({ units }: { units: ArchiveUnit[] }) {
  const t = useTranslations("admin.previousProperties.details");
  const locale = useLocale();
  if (units.length === 0) return <p className="mt-2 text-sm text-slate-500">{t("noUnits")}</p>;
  const floors = [...new Set(units.map((u) => u.floor ?? -1))].sort((a, b) => b - a);
  return (
    <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
      {floors.map((f) => (
        <div key={f} className="flex gap-3 rounded-lg bg-white/70 p-2">
          <p className="w-16 shrink-0 pt-1 text-xs font-bold text-slate-500">{f < 0 ? t("floorNone") : t("floor", { n: f })}</p>
          <ul className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {units.filter((u) => (u.floor ?? -1) === f).map((u) => (
              <li key={u.id} className={clsx("rounded-lg border px-2.5 py-1.5 text-xs", u.availability === "ARCHIVED" ? "border-slate-200 bg-slate-50 text-slate-500" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                <p className="flex items-center justify-between gap-2 font-bold"><span className="truncate">{u.unitNumber}</span><span className="shrink-0 text-[0.62rem] uppercase">{t(`unit.${u.availability}` as never)}</span></p>
                <p className="mt-0.5 truncate">{[u.bedrooms != null ? t("beds", { n: u.bedrooms }) : null, u.areaSqft ? t("sqft", { n: u.areaSqft }) : null, Number(u.rent) > 0 ? taka(locale, u.rent) : null].filter(Boolean).join(" · ") || "—"}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Body({ d, onMessage }: { d: ArchiveDetails; onMessage: () => void }) {
  const t = useTranslations("admin.previousProperties.details");
  const tr = useTranslations("admin.previousProperties.reason");
  const tt = useTranslations("admin.previousProperties.table");
  const locale = useLocale();
  const when = (iso: string) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(iso));
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  const card = "rounded-xl border border-slate-200/70 bg-white/60 p-3";
  const h = "text-[0.68rem] font-bold uppercase tracking-wider text-label";
  return (
    <div className="space-y-4">
      <div className={clsx(card, "flex flex-wrap items-center gap-4")}>
        <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-sky-100 text-[#0A84F0]"><Building2 className="size-7" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-navy">{d.name}</h3>
          <p className="text-xs font-semibold text-slate-500">{t("unitsLine", { units: num(d.totalUnits), floors: num(d.totalFloors) })}</p>
          <div className="mt-1.5"><StatusBadge status={d.status} /></div>
        </div>
      </div>

      <dl className={clsx(card, "grid gap-x-6 gap-y-3 sm:grid-cols-2")}>
        <Fact label={t("address")}><span className="flex items-start gap-1.5"><MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-500" aria-hidden />{d.location || t("none")}</span></Fact>
        <Fact label={t("type")}>{d.type}</Fact>
        <Fact label={t("deactivatedOn")}><span className="flex items-center gap-1.5"><CalendarX2 className="size-3.5 shrink-0 text-amber-500" aria-hidden />{day(locale, d.deactivatedAt)}</span></Fact>
        <Fact label={t("reason")}>{tr(d.reasonCode)}</Fact>
        <Fact label={t("created")}>{day(locale, d.createdAt)}</Fact>
        {d.reasonNote && <Fact label={t("note")}>{d.reasonNote}</Fact>}
      </dl>

      <section aria-label={t("owner")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><UserRound className="size-3.5" aria-hidden />{t("owner")}</h3>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-bold text-navy">{d.owner.fullName}{d.owner.ownerCode && <span className="ml-2 text-xs font-semibold text-[#0A84F0]">{tt("ownerId", { code: d.owner.ownerCode })}</span>}</p>
            <p className="mt-1 flex items-center gap-1.5 break-all text-xs text-slate-600"><Mail className="size-3 shrink-0 text-[#9333EA]" aria-hidden />{d.owner.email ?? "—"}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-600"><Phone className="size-3 shrink-0 text-[#0A84F0]" aria-hidden /><span dir="ltr">{formatPhone(d.owner.phone)}</span></p>
          </div>
          <button type="button" onClick={onMessage} className="btn btn-primary h-11 px-4 text-sm"><MessageCircle className="size-4" aria-hidden />{t("message")}</button>
        </div>
      </section>

      <section aria-label={t("matrix")} className={card}>
        <h3 className={h}>{t("matrix")} · {t("matrixCount", { n: num(d.units.length) })}</h3>
        <UnitMatrix units={d.units} />
      </section>

      <section aria-label={t("history")} className={card}>
        <h3 className={clsx(h, "flex items-center gap-1.5")}><History className="size-3.5" aria-hidden />{t("history")}</h3>
        {d.history.length === 0 ? <p className="mt-2 text-sm text-slate-500">{t("noHistory")}</p> : (
          <ol className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
            {d.history.map((l) => (
              <li key={l.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><span className="font-bold text-navy">{t.has(`event.${l.action.replace(/[.\-]/g, "_")}` as never) ? t(`event.${l.action.replace(/[.\-]/g, "_")}` as never) : l.action}</span>{l.status && <span className="text-slate-500">→ {t.has(`state.${l.status}` as never) ? t(`state.${l.status}` as never) : l.status}</span>}<span className="text-slate-500">· {when(l.at)}</span></p>
                {l.by && <p className="text-slate-500">{t("by", { name: l.by.name })}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

interface Props {
  row: ArchiveRow | null; busy?: boolean; onClose: () => void; labelledBy: string; title: string; onMessage: (o: ArchiveDetails["owner"]) => void;
  /** the bottom section of the window: just Close for View, the status form for Edit, Yes / Cancel for Delete */
  children: (d: ArchiveDetails | null) => React.ReactNode;
}

/** One window for View, Edit and Delete: the full record on top, the action at the bottom. */
export function PropertyFrame({ row, busy = false, onClose, labelledBy, title, onMessage, children }: Props) {
  const tt = useTranslations("admin.previousProperties.table");
  const [d, setD] = useState<ArchiveDetails | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!row) { setD(null); return; }
    let live = true;
    setState("loading");
    authApi<ArchiveDetails>(`/admin/previous-properties/${row.id}`).then((r) => { if (live) { setD(r); setState("ready"); } }).catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [row, tick]);

  return (
    <Modal open={!!row} onClose={() => !busy && onClose()} labelledBy={labelledBy} busy={busy} maxWidth="max-w-[850px]">
      {row && (
        <div>
          <h2 id={labelledBy} className="pr-10 text-xl font-bold text-navy">{title}</h2>
          {state === "loading" && <div className="mt-5 space-y-3" aria-busy="true"><div className="skeleton h-24 w-full rounded-xl" /><div className="skeleton h-28 w-full rounded-xl" /><div className="skeleton h-40 w-full rounded-xl" /></div>}
          {state === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center text-red-700"><AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{tt("error")}</p>
              <button type="button" onClick={() => setTick((n) => n + 1)} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{tt("retry")}</button></div>
          )}
          {state === "ready" && d && <div className="mt-4"><Body d={d} onMessage={() => onMessage(d.owner)} /></div>}
          <div className="mt-5 border-t border-slate-200/70 pt-4">{children(state === "ready" ? d : null)}</div>
        </div>
      )}
    </Modal>
  );
}
