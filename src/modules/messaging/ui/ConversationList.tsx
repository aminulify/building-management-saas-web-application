"use client";

import { AlertTriangle, Plus, RefreshCw, Search, SearchX, UsersRound, X } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { ConversationRow } from "./ConversationRow";
import { PersonAvatar } from "./PersonAvatar";
import { matchesQuery } from "./logic";
import { RoleChips, type RoleFilter } from "./RoleChips";
import type { Contact, Conversation } from "./types";

interface Props {
  items: Conversation[]; state: "loading" | "ready" | "error"; query: string; onQuery: (q: string) => void;
  activeId: string | null; meId: string; now: number; onSelect: (id: string) => void; onRetry: () => void; onNew: () => void;
  /** matches among people who have no chat yet */
  people: Contact[]; onPerson: (c: Contact) => void; className?: string;
  /** admins only: filter by kind of person (Tenant Free, Tenants, Owners, Government) */
  roleFilter?: RoleFilter; onRoleFilter?: (v: RoleFilter) => void;
}

/** Left column: search box, "new chat", the chats (filtered as you type) and people you can start a chat with. */
export function ConversationList({ items, state, query, onQuery, activeId, meId, now, onSelect, onRetry, onNew, people, onPerson, className, roleFilter, onRoleFilter }: Props) {
  const t = useTranslations("chat");
  const shown = items.filter((c) => matchesQuery(c, query));
  const filtered = !!roleFilter && roleFilter !== "all";
  const searching = query.trim().length > 0 || filtered;

  return (
    <section aria-label={t("list.aria")} className={clsx("flex min-h-0 flex-col border-white/60 md:border-r", className)}>
      <div className="flex items-center gap-2 p-4">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">{t("search.aria")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[1.15rem] -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t("search.placeholder")} autoComplete="off"
            className="glass-input h-11 w-full rounded-xl pl-10 pr-9 text-sm [&::-webkit-search-cancel-button]:appearance-none" />
          {searching && <button type="button" onClick={() => onQuery("")} aria-label={t("search.clear")} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-navy"><X className="size-4" aria-hidden /></button>}
        </label>
        <button type="button" onClick={onNew} aria-label={t("new.open")} title={t("new.open")} className="btn btn-primary size-11 shrink-0 !rounded-xl !px-0"><Plus className="size-5" aria-hidden /></button>
      </div>

      {roleFilter !== undefined && onRoleFilter && <RoleChips value={roleFilter} onChange={onRoleFilter} className="px-4 pb-3" />}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {state === "loading" && (
          <ul aria-busy="true" className="space-y-1 px-4">
            <li className="sr-only">{t("list.loading")}</li>
            {[0, 1, 2, 3, 4].map((i) => <li key={i} aria-hidden className="flex items-center gap-3 py-3"><span className="skeleton size-12 rounded-full" /><span className="flex-1 space-y-2"><span className="skeleton block h-3 w-1/2" /><span className="skeleton block h-3 w-3/4" /></span></li>)}
          </ul>
        )}
        {state === "error" && (
          <div role="alert" className="m-4 flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-8 text-center text-red-700">
            <AlertTriangle className="size-7" aria-hidden /><p className="text-sm font-semibold">{t("list.error")}</p>
            <button type="button" onClick={onRetry} className="btn btn-white h-9 px-4 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}
        {state === "ready" && items.length === 0 && !searching && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span aria-hidden className="grid size-14 place-items-center rounded-2xl bg-sky-100 text-sky-600"><UsersRound className="size-7" /></span>
            <h2 className="font-bold text-navy">{t("list.emptyTitle")}</h2>
            <p className="text-sm text-slate-600">{t("list.emptyText")}</p>
            <button type="button" onClick={onNew} className="btn btn-primary h-10 px-5 text-sm"><Plus className="size-4" aria-hidden />{t("new.open")}</button>
          </div>
        )}
        {state === "ready" && shown.length > 0 && <ul>{shown.map((c) => <ConversationRow key={c.id} c={c} selected={c.id === activeId} meId={meId} now={now} onSelect={onSelect} />)}</ul>}

        {state === "ready" && searching && people.length > 0 && (
          <div className="border-t border-white/60 pt-2">
            <h2 className="px-4 pb-1 pt-2 text-[0.68rem] font-bold uppercase tracking-wider text-slate-500">{t("search.people")}</h2>
            <ul>
              {people.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPerson(p)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-300 hover:bg-white/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#48BDFA]">
                    <PersonAvatar name={p.fullName} url={p.avatarUrl} online={p.online} size="size-10" />
                    <span className="min-w-0"><span className="block truncate text-sm font-bold text-navy">{p.fullName}</span><span className="block truncate text-xs text-slate-500">{p.unit && p.property ? t("list.unitLine", { property: p.property, unit: p.unit }) : t(`roles.${p.role}` as never)}</span></span>
                    <span className="ml-auto text-xs font-semibold text-[#0A84F0]">{t("search.start")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {state === "ready" && searching && shown.length === 0 && people.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-slate-600"><SearchX className="size-8 text-slate-400" aria-hidden /><p className="text-sm font-semibold text-navy">{t("search.noMatch", { q: query.trim() })}</p></div>
        )}
      </div>
    </section>
  );
}
