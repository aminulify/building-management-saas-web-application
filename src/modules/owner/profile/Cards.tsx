"use client";

import { Building2, ChevronRight, FileText, MapPin, User } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { formatNumber } from "../dashboard/format";
import { formatDate, formatPhone } from "../tenants/format";
import { DOC_ROW, DOC_STYLE, formatDob } from "./logic";
import type { DocKind, DocState, OverviewProperty, OwnerOverview } from "./types";

/** A glass card that rises into place when it scrolls into view and lifts slightly on hover. */
export function Reveal({ children, className, delay = 0, label }: { children: React.ReactNode; className?: string; delay?: number; label: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.section aria-label={label} initial={{ opacity: 0, y: reduce ? 0 : 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -40px 0px" }} transition={{ duration: 0.45, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      className={clsx("rounded-2xl border border-white/70 bg-white/70 p-5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.35)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-22px_rgba(15,23,42,0.4)] motion-reduce:hover:translate-y-0", className)}>
      {children}
    </motion.section>
  );
}

const Title = ({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) => (
  <h2 className="mb-4 flex items-center gap-2.5 text-[1.02rem] font-bold text-navy"><Icon className="size-5 text-[#48BDFA]" aria-hidden />{children}</h2>
);
const Item = ({ label, children, blue }: { label: string; children: React.ReactNode; blue?: boolean }) => (
  <div className="min-w-0"><dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className={clsx("mt-0.5 break-words text-[0.97rem] font-medium", blue ? "font-extrabold text-[#0A84F0]" : "text-navy")}>{children || "—"}</dd></div>
);

export function PersonalCard({ data }: { data: OwnerOverview }) {
  const t = useTranslations("owner.profile.personal");
  const locale = useLocale();
  const u = data.user;
  return (
    <Reveal label={t("title")}>
      <Title icon={User}>{t("title")}</Title>
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Item label={t("fullName")}>{u.fullName}</Item>
        <Item label={t("phone")}>{formatPhone(u.phone)}</Item>
        <Item label={t("email")}>{u.email}</Item>
        <Item label={t("occupation")}>{u.occupation}</Item>
        <Item label={t("nid")}>{u.nid}</Item>
        <Item label={t("dob")}>{formatDob(locale, u.dateOfBirth)}</Item>
        <Item label={t("ownerId")} blue>{u.ownerCode}</Item>
        <Item label={t("verification")}><span className={clsx("inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide", u.verificationStatus === "VERIFIED" ? "bg-green-500 text-white" : u.verificationStatus === "PENDING" ? "bg-yellow-400 text-yellow-950" : u.verificationStatus === "REJECTED" ? "bg-red-600 text-white" : "bg-slate-300 text-slate-700")}>{t(`status.${u.verificationStatus}`)}</span></Item>
      </dl>
      <p className="mt-4 text-xs text-label">{t("idNote")}</p>
    </Reveal>
  );
}

export function AddressCard({ data }: { data: OwnerOverview }) {
  const t = useTranslations("owner.profile.address");
  const a = data.address;
  return (
    <Reveal label={t("title")} delay={0.05}>
      <Title icon={MapPin}>{t("title")}</Title>
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Item label={t("division")}>{a?.division}</Item>
        <Item label={t("district")}>{a?.district}</Item>
        <Item label={t("upazila")}>{a?.upazila}</Item>
        <Item label={t("union")}>{a?.union}</Item>
        <Item label={t("street")}>{a?.street}</Item>
        <Item label={t("postOffice")}>{a?.postOffice}</Item>
      </dl>
    </Reveal>
  );
}

export function PortfolioCard({ data, onOpen }: { data: OwnerOverview; onOpen: (p: OverviewProperty) => void }) {
  const t = useTranslations("owner.profile.portfolio");
  const locale = useLocale();
  const n = formatNumber(locale);
  const p = data.portfolio;
  return (
    <Reveal label={t("title")}>
      <Title icon={Building2}>{t("title")}</Title>
      <dl className="space-y-2.5">
        {([["properties", p.properties], ["units", p.units], ["tenants", p.tenants]] as const).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-lg bg-sky-100/70 px-3.5 py-2.5"><dt className="text-[0.72rem] font-bold uppercase tracking-wide text-navy">{t(k)}</dt><dd className="text-base font-extrabold text-[#0A84F0]"><CountUp value={v} format={n} /></dd></div>
        ))}
      </dl>
      <h3 className="mb-1 mt-5 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">{t("mine")}</h3>
      {data.properties.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-600">{t("none")}</p> : (
        <ul className="max-h-72 overflow-y-auto">
          {data.properties.map((x) => (
            <li key={x.id} className="border-b border-slate-200/70 last:border-0">
              <button type="button" onClick={() => onOpen(x)} className="group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors duration-300 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-[#48BDFA]">
                {x.coverUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={x.coverUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" /> : <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-400"><Building2 className="size-5" /></span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-navy">{x.name}</span><span className="block truncate text-[0.7rem] text-slate-500">{x.locationLabel || "—"}</span></span>
                <ChevronRight className="size-4 shrink-0 text-slate-300 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-[#48BDFA] rtl:rotate-180" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Reveal>
  );
}

function DocRow({ title, state, label, date, onClick }: { title: string; state: keyof typeof DOC_STYLE; label: string; date: string | null; onClick: () => void }) {
  const locale = useLocale();
  return (
    <li>
      <button type="button" onClick={onClick} className={clsx("flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0", DOC_ROW[state])}>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold text-navy">{title}</span><span className="block text-[0.68rem] text-slate-500">{date ? formatDate(locale, date) : "—"}</span></span>
        <span className={clsx("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wide", DOC_STYLE[state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{label}</span>
      </button>
    </li>
  );
}

export function DocumentsCard({ data, onNid, onAgreement }: { data: OwnerOverview; onNid: (k: DocKind) => void; onAgreement: () => void }) {
  const t = useTranslations("owner.profile.documents");
  const d = data.documents;
  const nid = (s: DocState | null, kind: DocKind, title: string) => <DocRow key={kind} title={title} state={s ? s.status : "NONE"} label={s ? t(`state.${s.status}`) : t("state.NONE")} date={s?.date ?? null} onClick={() => onNid(kind)} />;
  const ag = d.agreement;
  return (
    <Reveal label={t("title")} delay={0.08}>
      <Title icon={FileText}>{t("title")}</Title>
      <ul className="space-y-2.5">
        {nid(d.nidFront, "NID_FRONT", t("nidFront"))}
        {nid(d.nidBack, "NID_BACK", t("nidBack"))}
        <DocRow title={t("agreement")} state={ag.status === "UPLOADED" ? "VERIFIED" : ag.status === "PENDING" ? "PENDING" : "NONE"} label={ag.status === "NONE" ? t("state.NONE") : t("agreementCount", { done: ag.uploaded, total: ag.total })} date={ag.date} onClick={onAgreement} />
      </ul>
      <p className="mt-3 text-[0.7rem] text-label">{t("hint")}</p>
    </Reveal>
  );
}
