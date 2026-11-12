"use client";

import { ArrowRight, Mail, Phone, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { formatPhone } from "../../owner/tenants/format";
import { Avatar } from "../owners/OwnersTable";
import { VERIFY_STYLE } from "../tenants/TenantsTable";
import type { FoundPerson, FoundRole } from "./types";

export const ROLE_STYLE: Record<FoundRole, string> = { OWNER: "bg-sky-100 text-sky-700", TENANT: "bg-purple-100 text-purple-700", GENERAL_USER: "bg-amber-100 text-amber-700" };

export function RoleBadge({ role }: { role: FoundRole }) {
  const t = useTranslations("admin.findPeople.role");
  return <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold", ROLE_STYLE[role])}>{t(role)}</span>;
}

/** One match: photo, name, role, NID status, e-mail, phone and the View Full Profile button. */
export function ResultCard({ p, index, onOpen }: { p: FoundPerson; index: number; onOpen: (p: FoundPerson) => void }) {
  const t = useTranslations("admin.findPeople");
  const reduce = useReducedMotion();
  const code = p.ownerCode ?? p.tenantCode;
  return (
    <motion.article
      initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: reduce ? 0 : index * 0.06 }}
      className="glass-card group flex flex-col gap-4 p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_-18px_rgba(15,23,42,0.35)] motion-reduce:hover:translate-y-0 sm:flex-row sm:items-center sm:p-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="relative shrink-0"><Avatar name={p.fullName} url={p.avatarUrl} size="size-16" /><span aria-hidden className={clsx("absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-white", p.online ? "bg-emerald-500" : "bg-slate-300")} /></span>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold text-navy">{p.fullName}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RoleBadge role={p.role} />
            <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", VERIFY_STYLE[p.verificationStatus])}><ShieldCheck className="size-3.5" aria-hidden />{t(`nid.${p.verificationStatus}`)}</span>
            {code && <span className="text-xs font-semibold text-[#0A84F0]">{t("id", { code })}</span>}
            {(p.archived || p.status !== "ACTIVE") && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">{p.archived ? t("archived") : t(`account.${p.status}` as never)}</span>}
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 break-all text-sm text-slate-600"><Mail className="size-3.5 shrink-0 text-[#9333EA]" aria-hidden /><span className="sr-only">{t("email")}: </span>{p.email ?? "—"}</p>
          <p className="flex items-center gap-1.5 text-sm text-slate-600"><Phone className="size-3.5 shrink-0 text-[#0A84F0]" aria-hidden /><span className="sr-only">{t("phone")}: </span><span dir="ltr">{formatPhone(p.phone)}</span></p>
        </div>
      </div>
      <button type="button" onClick={() => onOpen(p)} aria-label={t("openAria", { name: p.fullName })} className="btn btn-primary h-11 shrink-0 px-5 text-sm">{t("viewProfile")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></button>
    </motion.article>
  );
}
