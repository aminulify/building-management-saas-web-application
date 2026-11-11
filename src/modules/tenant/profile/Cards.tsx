"use client";

import { Building2, FileText, MapPin, UploadCloud, User } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatPhone } from "../../owner/tenants/format";
import { Reveal } from "../../owner/profile/Cards";
import { DOC_ROW, DOC_STYLE, formatDob } from "../../owner/profile/logic";
import type { DocState, TenantOverview } from "./types";

const Title = ({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) => (
  <h2 className="mb-4 flex items-center gap-2.5 text-[1.02rem] font-bold text-navy"><Icon className="size-5 text-[#48BDFA]" aria-hidden />{children}</h2>
);
const Item = ({ label, children, blue }: { label: string; children: React.ReactNode; blue?: boolean }) => (
  <div className="min-w-0"><dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className={clsx("mt-0.5 break-words text-[0.97rem] font-medium", blue ? "font-extrabold text-[#0A84F0]" : "text-navy")}>{children || "—"}</dd></div>
);

export function PersonalCard({ data }: { data: TenantOverview }) {
  const t = useTranslations("tenant.profile.personal");
  const locale = useLocale();
  const u = data.user;
  return (
    <Reveal label={t("title")}>
      <Title icon={User}>{t("title")}</Title>
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Item label={t("fullName")}>{u.fullName}</Item>
        <Item label={t("phone")}>{formatPhone(u.phone)}</Item>
        <Item label={t("email")}><span className="break-all">{u.email}</span></Item>
        <Item label={t("occupation")}>{u.occupation}</Item>
        <Item label={t("nid")}>{u.nid}</Item>
        <Item label={t("dob")}>{formatDob(locale, u.dateOfBirth)}</Item>
        <Item label={t("tenantId")} blue>{u.tenantCode}</Item>
        <Item label={t("member")}>{String(u.members)}</Item>
      </dl>
      <p className="mt-4 text-xs text-label">{t("idNote")}</p>
    </Reveal>
  );
}

/** Building, unit and floor, address, landlord and entry / exit of the current lease. */
export function CurrentUnitCard({ data }: { data: TenantOverview }) {
  const t = useTranslations("tenant.profile.unit");
  const locale = useLocale();
  const x = data.tenancy;
  if (!x) return null;
  return (
    <Reveal label={t("title")} delay={0.03}>
      <Title icon={Building2}>{t("title")}</Title>
      <p className="text-lg font-extrabold text-navy">{x.property.name}</p>
      <p className="text-sm font-semibold text-[#0A84F0]">{t("unitFloor", { unit: x.unit.unitNumber, floor: x.unit.floor })}</p>
      {x.property.addressLine && <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600"><MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />{x.property.addressLine}</p>}
      <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-slate-50/80 p-3.5">
        <Item label={t("landlord")}>{x.landlord?.fullName}</Item>
        <Item label={t("entry")}>{formatDate(locale, x.startDate)}</Item>
        <Item label={t("exit")}>{x.endDate ? formatDate(locale, x.endDate) : t("no")}</Item>
      </dl>
    </Reveal>
  );
}

export function AddressCard({ data }: { data: TenantOverview }) {
  const t = useTranslations("tenant.profile.address");
  const a = data.address;
  return (
    <Reveal label={t("title")} delay={0.05}>
      <Title icon={MapPin}>{t("title")}</Title>
      <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Item label={t("division")}>{a?.division}</Item>
        <Item label={t("district")}>{a?.district}</Item>
        <Item label={t("upazila")}>{a?.upazila}</Item>
        <Item label={t("union")}>{a?.union ? a.union.toUpperCase() : null}</Item>
        <Item label={t("street")}>{a?.street}</Item>
        <Item label={t("postOffice")}>{a?.postOffice}</Item>
      </dl>
    </Reveal>
  );
}

function DocRow({ title, sub, state, label, onClick, action }: { title: string; sub: string; state: keyof typeof DOC_STYLE; label?: string; onClick?: () => void; action?: React.ReactNode }) {
  const body = (
    <>
      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-navy">{title}</span><span className="block text-[0.68rem] text-slate-500">{sub}</span></span>
      {action ?? <span className={clsx("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wide", DOC_STYLE[state])}><i aria-hidden className="size-1.5 rounded-full bg-current" />{label}</span>}
    </>
  );
  const cls = clsx("flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-all duration-300", DOC_ROW[state]);
  return <li>{onClick ? <button type="button" onClick={onClick} className={clsx(cls, "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0")}>{body}</button> : <div className={cls}>{body}</div>}</li>;
}

/** NID front, NID back and the agreement. The NID rows open the upload window; the agreement has its own Upload button. */
export function DocumentsCard({ data, onNid, onAgreement }: { data: TenantOverview; onNid: (k: "NID_FRONT" | "NID_BACK") => void; onAgreement: () => void }) {
  const t = useTranslations("tenant.profile.documents");
  const locale = useLocale();
  const d = data.documents;
  const nid = (s: DocState | null, kind: "NID_FRONT" | "NID_BACK", title: string) => (
    <DocRow key={kind} title={title} sub={s ? formatDate(locale, s.date) : t("notUploaded")} state={s ? s.status : "NONE"} label={s ? t(`state.${s.status}`) : t("state.NONE")} onClick={() => onNid(kind)} />
  );
  const ag = d.agreement;
  return (
    <Reveal label={t("title")} delay={0.08}>
      <Title icon={FileText}>{t("title")}</Title>
      <ul className="space-y-2.5">
        {nid(d.nidFront, "NID_FRONT", t("nidFront"))}
        {nid(d.nidBack, "NID_BACK", t("nidBack"))}
        {!ag
          ? <DocRow title={t("agreement")} sub={t("noAgreement")} state="NONE" action={<button type="button" onClick={onAgreement} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[#0A84F0] px-3 text-[0.68rem] font-extrabold uppercase tracking-wide text-white shadow-[0_6px_14px_-6px_rgba(10,132,240,0.7)] transition-colors duration-300 hover:bg-[#0873D6]"><UploadCloud className="size-3.5" aria-hidden />{t("upload")}</button>} />
          : ag.source === "LANDLORD"
            ? <DocRow title={t("agreement")} sub={t("landlordCopy", { date: formatDate(locale, ag.date) })} state="VERIFIED" label={t("state.AVAILABLE")} />
            : <DocRow title={t("agreement")} sub={formatDate(locale, ag.date)} state={ag.status} label={t(`state.${ag.status}`)} onClick={onAgreement} />}
      </ul>
      <p className="mt-3 text-[0.7rem] text-label">{t("hint")}</p>
    </Reveal>
  );
}
