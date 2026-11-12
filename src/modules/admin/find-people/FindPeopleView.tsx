"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Loader2, Search, SearchX, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { MessageModal } from "../owners/MessageModal";
import { ListingModal, PropertyModal, UnitModal } from "./DetailModals";
import { NavProvider, type NavItem } from "./nav";
import { ProfileModal } from "./ProfileModal";
import { ResultCard } from "./ResultCard";
import type { FindResult } from "./types";

type Phase = "idle" | "loading" | "done" | "short" | "limited" | "error";

/** Super Admin → Find People: one search box for an NID, e-mail, phone, account ID or username; matches come as cards that open the full profile. */
export function FindPeopleView() {
  const t = useTranslations("admin.findPeople");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<FindResult | null>(null);
  // the windows opened one from another (person → property → unit …); closing goes back one step
  const [stack, setStack] = useState<NavItem[]>([]);
  const open = useCallback((item: NavItem) => setStack((s) => (s.at(-1)?.kind === item.kind && s.at(-1)?.id === item.id ? s : [...s, item].slice(-12))), []);
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const top = stack.at(-1) ?? null;
  const idOf = (kind: NavItem["kind"]) => (top?.kind === kind ? top.id : null);
  const [messaging, setMessaging] = useState<{ id: string; fullName: string; avatarUrl: string | null } | null>(null);
  const seq = useRef(0);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (q.length < 3) { setPhase("short"); setResult(null); return; }
    const id = ++seq.current;
    setPhase("loading");
    try {
      const r = await authApi<FindResult>(`/admin/find-people?q=${encodeURIComponent(q)}`);
      if (id !== seq.current) return;
      setResult(r); setPhase("done");
    } catch (err) {
      if (id !== seq.current) return;
      setResult(null);
      setPhase(err instanceof ApiError && err.status === 429 ? "limited" : err instanceof ApiError && err.status === 422 ? "short" : "error");
    }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <FadeIn delay={0.08}>
        <form onSubmit={search} role="search" className="glass-card p-4 sm:p-6">
          <label htmlFor="fp-q" className="sr-only">{t("searchLabel")}</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="glass-input flex h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4">
              <Search className="size-5 shrink-0 text-slate-400" aria-hidden />
              <input id="fp-q" type="search" value={text} onChange={(e) => { setText(e.target.value); if (phase === "short") setPhase("idle"); }} maxLength={120} autoComplete="off" autoFocus placeholder={t("placeholder")} className="h-full min-w-0 flex-1 bg-transparent text-base text-navy outline-none placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden" />
            </div>
            <button type="submit" disabled={phase === "loading"} aria-busy={phase === "loading" || undefined} className="btn btn-primary h-14 rounded-2xl px-8 text-base">
              {phase === "loading" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Search className="size-5" aria-hidden />}{phase === "loading" ? t("searching") : t("search")}
            </button>
          </div>
          <p className={`mt-3 text-sm ${phase === "short" ? "font-semibold text-red-600" : "text-slate-500"}`} role={phase === "short" ? "alert" : undefined}>{phase === "short" ? t("tooShort") : t("tips")}</p>
        </form>
      </FadeIn>

      <div aria-live="polite" className="space-y-4">
        {phase === "loading" && <div aria-busy="true" className="space-y-3"><span className="sr-only">{t("searching")}</span><div className="skeleton h-28 w-full rounded-2xl" /></div>}
        {phase === "done" && result && result.items.length > 0 && (
          <>
            <p className="text-sm font-semibold text-slate-600">{t("found", { count: result.items.length })}</p>
            {result.items.map((p, i) => <ResultCard key={p.id} p={p} index={i} onOpen={(x) => open({ kind: "person", id: x.id })} />)}
          </>
        )}
        {phase === "done" && result && result.items.length === 0 && (
          <div className="glass-card flex flex-col items-center gap-2 px-4 py-12 text-center"><span aria-hidden className="grid size-14 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><SearchX className="size-7" /></span><p className="font-bold text-navy">{t("noneTitle")}</p><p className="max-w-md text-sm text-slate-600">{t("noneText")}</p></div>
        )}
        {phase === "limited" && <div role="alert" className="glass-card flex items-center gap-3 border-amber-200 px-4 py-5 text-amber-800"><ShieldAlert className="size-6 shrink-0" aria-hidden /><p className="text-sm font-semibold">{t("limited")}</p></div>}
        {phase === "error" && <div role="alert" className="glass-card flex items-center gap-3 border-red-200 px-4 py-5 text-red-700"><AlertTriangle className="size-6 shrink-0" aria-hidden /><p className="text-sm font-semibold">{t("error")}</p></div>}
        {phase === "idle" && (
          <div className="glass-card flex flex-col items-center gap-2 px-4 py-12 text-center"><span aria-hidden className="grid size-14 place-items-center rounded-full bg-sky-100 text-[#0A84F0]"><Search className="size-7" /></span><p className="font-bold text-navy">{t("idleTitle")}</p><p className="max-w-md text-sm text-slate-600">{t("idleText")}</p></div>
        )}
      </div>

      <NavProvider value={open}>
        <ProfileModal personId={idOf("person")} canGoBack={stack.length > 1} onClose={back} onMessage={setMessaging} />
        <PropertyModal id={idOf("property")} canGoBack={stack.length > 1} onClose={back} />
        <ListingModal id={idOf("listing")} canGoBack={stack.length > 1} onClose={back} />
        <UnitModal id={idOf("unit")} canGoBack={stack.length > 1} onClose={back} />
      </NavProvider>
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
