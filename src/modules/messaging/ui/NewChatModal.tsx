"use client";

import { useState } from "react";
import { AlertTriangle, Search, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { PersonAvatar } from "./PersonAvatar";
import { useContacts } from "./use-contacts";
import type { Contact } from "./types";

interface Props { open: boolean; role: string; busy: boolean; onClose: () => void; onPick: (c: Contact) => void }

/** "New chat": owners see their tenants, tenants their landlord, admins search anyone they may write to. */
export function NewChatModal({ open, role, busy, onClose, onPick }: Props) {
  const t = useTranslations("chat.new");
  const rt = useTranslations("chat.roles");
  const [q, setQ] = useState("");
  const admin = role === "SUPER_ADMIN" || role === "GOV_ADMIN";
  const { items, state } = useContacts(q, open && (!admin || q.trim().length >= 2));

  return (
    <Modal open={open} onClose={onClose} labelledBy="chat-new-title" busy={busy} maxWidth="max-w-[460px]">
      <h2 id="chat-new-title" className="pr-10 text-lg font-bold text-navy">{t("title")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t(admin ? "adminHint" : role === "TENANT" ? "tenantHint" : "ownerHint")}</p>
      <label className="relative mt-4 block">
        <span className="sr-only">{t("search")}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[1.1rem] -translate-y-1/2 text-slate-400" />
        <input data-autofocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} autoComplete="off" className="glass-input h-11 w-full rounded-xl pl-10 pr-3 text-sm" />
      </label>
      <div className="mt-3 max-h-[min(22rem,50vh)] overflow-y-auto" aria-busy={state === "loading" || undefined}>
        {state === "loading" && <ul className="space-y-2">{[0, 1, 2].map((i) => <li key={i} className="skeleton h-14 rounded-xl" />)}</ul>}
        {state === "error" && <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-3 text-sm font-medium text-red-700"><AlertTriangle className="size-4" aria-hidden />{t("error")}</p>}
        {state === "ready" && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center"><span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-sky-100 text-sky-600"><UsersRound className="size-6" /></span><p className="text-sm text-slate-600">{t(q.trim() ? "noMatch" : "none")}</p></div>
        )}
        {state === "idle" && admin && <p className="py-8 text-center text-sm text-slate-500">{t("typeMore")}</p>}
        {state === "ready" && items.length > 0 && (
          <ul className="space-y-1">
            {items.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={busy} onClick={() => onPick(c)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-300 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[#48BDFA] disabled:opacity-60">
                  <PersonAvatar name={c.fullName} url={c.avatarUrl} online={c.online} size="size-11" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold text-navy">{c.fullName}</span><span className="block truncate text-xs text-slate-500">{c.unit && c.property ? t("unitLine", { property: c.property, unit: c.unit }) : `${rt(c.role as never)} · @${c.username}`}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
