"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, MapPin, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatNumber, formatTaka } from "../owner/dashboard/format";
import type { AiResponse, AiResult, Mode } from "./types";

interface Msg { id: number; role: "user" | "ai" | "error"; text?: string; ai?: AiResponse }

interface Props {
  open: boolean;
  mode: Mode;
  onClose: () => void;
  /** the assistant understood a sentence: the page copies the filters into its filter card */
  onApply: (ai: AiResponse) => void;
  onOpenHome: (id: string) => void;
  onShowAll: () => void;
  /** example sentences shown before the first question (Find Home and Marketplace differ) */
  examples?: string[];
}

/** Chips that show what the assistant understood, so the person can see (and trust) what was searched. */
function useUnderstood(ai: AiResponse) {
  const t = useTranslations("owner.findHome");
  const locale = useLocale();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const f = ai.filters;
  const chips: string[] = [];
  chips.push(t(f.type === "RENT" ? "modeRent" : "modeSale"));
  const place = [f.unionName, f.upazila, f.district].filter(Boolean).join(", ");
  if (place) chips.push(place);
  if (f.bedroomList?.length) chips.push(t("filters.bedN", { n: f.bedroomList.map(n).join("/") }));
  if (f.minPrice !== undefined && f.maxPrice !== undefined) chips.push(`${taka(f.minPrice)} – ${taka(f.maxPrice)}`);
  else if (f.maxPrice !== undefined) chips.push(t("ai.upTo", { v: taka(f.maxPrice) }));
  else if (f.minPrice !== undefined) chips.push(t("ai.from", { v: taka(f.minPrice) }));
  if (f.landType) chips.push(t(`details.landTypes.${f.landType}`));
  if (f.categories?.length) chips.push(t(`filters.types.${f.categories.includes("LAND") ? "LAND" : f.categories.includes("DUPLEX") ? "DUPLEX" : f.categories.includes("STUDIO") ? "STUDIO" : f.categories.includes("COMMERCIAL") ? "COMMERCIAL" : "APARTMENT"}`));
  f.nearby.forEach((k) => chips.push(t(`filters.nearby.${k}`)));
  f.amenities.forEach((k) => chips.push(t(`filters.amenity.${k}`)));
  if (f.furnishing) chips.push(t(`filters.furnishing.${f.furnishing}`));
  return chips;
}

function Understood({ ai }: { ai: AiResponse }) {
  const t = useTranslations("owner.findHome.ai");
  const chips = useUnderstood(ai);
  return (
    <div>
      <p className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-label">{ai.understood > 0 ? t("understood") : t("noFilters")}</p>
      <div className="flex flex-wrap gap-1.5">{chips.map((c, i) => <span key={`${c}${i}`} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{c}</span>)}</div>
    </div>
  );
}

function MatchCard({ r, onOpen }: { r: AiResult; onOpen: () => void }) {
  const t = useTranslations("owner.findHome");
  const locale = useLocale();
  const n = formatNumber(locale), taka = formatTaka(locale);
  const hue = r.matchPercent >= 85 ? "bg-emerald-500" : r.matchPercent >= 60 ? "bg-sky-500" : "bg-amber-500";
  return (
    <button type="button" onClick={onOpen} className="group flex w-full gap-3 rounded-xl border border-slate-200 bg-white/80 p-2.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md motion-reduce:hover:translate-y-0">
      <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
        {r.coverUrl && <img src={r.coverUrl} alt="" loading="lazy" className="size-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-navy">{r.title}</p>
        <p className="flex items-center gap-1 truncate text-xs text-slate-600"><MapPin className="size-3 shrink-0 text-pink-500" aria-hidden />{r.locationLabel}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-[#0A84F0]">{taka(Number(r.price))}</span>
          <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold text-white ${hue}`}>{t("card.match", { n: n(r.matchPercent) })}</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden><div className={`h-full rounded-full ${hue} transition-all duration-500`} style={{ width: `${r.matchPercent}%` }} /></div>
      </div>
    </button>
  );
}

export function AiDrawer({ open, mode, onClose, onApply, onOpenHome, onShowAll, examples: given }: Props) {
  const t = useTranslations("owner.findHome.ai");
  const locale = useLocale();
  const n = formatNumber(locale);
  const reduce = useReducedMotion();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => input.current?.focus(), 250);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" }); }, [msgs, busy, reduce]);

  async function ask(q: string) {
    const query = q.trim();
    if (query.length < 2 || busy) return;
    setText(""); setBusy(true);
    setMsgs((m) => [...m, { id: ++seq.current, role: "user", text: query }]);
    try {
      const ai = await authApi<AiResponse>("/listings/ai-search", { method: "POST", body: { query, type: mode } });
      setMsgs((m) => [...m, { id: ++seq.current, role: "ai", ai }]);
      onApply(ai);
    } catch (e) {
      setMsgs((m) => [...m, { id: ++seq.current, role: "error", text: e instanceof ApiError && e.status === 429 ? t("rate") : t("error") }]);
    } finally { setBusy(false); setTimeout(() => input.current?.focus(), 50); }
  }

  const examples = given ?? [t("ex1"), t("ex2"), t("ex3")];

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[60] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <div aria-hidden className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            role="dialog" aria-modal="true" aria-labelledby="fh-ai-title"
            initial={{ x: reduce ? 0 : 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: reduce ? 0 : 40, opacity: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-dvh w-full flex-col bg-white/95 shadow-2xl backdrop-blur-xl sm:max-w-[440px] sm:rounded-l-2xl"
          >
            <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
              <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-brand-gradient text-white"><Sparkles className="size-5" /></span>
              <div className="min-w-0 flex-1"><h2 id="fh-ai-title" className="font-bold text-navy">{t("title")}</h2><p className="truncate text-xs text-label">{t("subtitle")}</p></div>
              {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} aria-label={t("newChat")} title={t("newChat")} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"><RotateCcw className="size-4" aria-hidden /></button>}
              <button type="button" onClick={onClose} aria-label={t("close")} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy"><X className="size-5" aria-hidden /></button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin]" aria-live="polite">
              <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-700">{t("hello")}</div>
              {msgs.length === 0 && (
                <div className="space-y-2">
                  <p className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("try")}</p>
                  {examples.map((ex) => <button key={ex} type="button" onClick={() => ask(ex)} className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm text-navy transition-all duration-300 hover:border-sky-300 hover:bg-sky-50/60">{ex}</button>)}
                </div>
              )}
              {msgs.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                  {m.role === "user" && <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-tr-md bg-brand-gradient px-3.5 py-2.5 text-sm font-medium text-white">{m.text}</div>}
                  {m.role === "error" && <div role="alert" className="max-w-[92%] rounded-2xl rounded-tl-md bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{m.text}</div>}
                  {m.role === "ai" && m.ai && (
                    <div className="space-y-3 rounded-2xl rounded-tl-md bg-slate-50 p-3.5">
                      <Understood ai={m.ai} />
                      {m.ai.understood > 0 && <p className="text-xs font-medium text-emerald-700">{t("applied")}</p>}
                      {m.ai.profile && <p className="rounded-lg bg-pink-50 px-2.5 py-1.5 text-xs text-pink-700">{t("profile", { n: n(m.ai.profile.saved) })}</p>}
                      {m.ai.results.length > 0 ? (
                        <>
                          <p className="text-[0.68rem] font-bold uppercase tracking-wider text-label">{t("best", { n: n(m.ai.results.length) })}</p>
                          <div className="space-y-2">{m.ai.results.slice(0, 4).map((r) => <MatchCard key={r.id} r={r} onOpen={() => onOpenHome(r.id)} />)}</div>
                          <button type="button" onClick={onShowAll} className="btn btn-primary h-10 w-full text-sm">{t("showAll")}</button>
                        </>
                      ) : <p className="text-sm text-slate-600">{t("noMatches")}</p>}
                    </div>
                  )}
                </motion.div>
              ))}
              {busy && <div className="flex w-fit items-center gap-2 rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600" role="status"><Loader2 className="size-4 animate-spin" aria-hidden />{t("thinking")}</div>}
              <div ref={bottom} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void ask(text); }} className="flex items-end gap-2 border-t border-slate-100 p-3">
              <label htmlFor="fh-ai-input" className="sr-only">{t("inputLabel")}</label>
              <textarea
                ref={input} id="fh-ai-input" value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={300} placeholder={t("placeholder")}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(text); } }}
                className="glass-input max-h-28 min-h-11 flex-1 resize-none rounded-xl px-3 py-2.5 text-sm text-navy outline-none placeholder:text-slate-400"
              />
              <button type="submit" disabled={busy || text.trim().length < 2} aria-label={t("send")} className="btn btn-primary size-11 shrink-0 !p-0"><Send className="size-[1.1rem]" aria-hidden /></button>
            </form>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
