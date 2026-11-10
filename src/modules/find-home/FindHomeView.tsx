"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, CalendarClock, ChevronDown, Heart, Home, Loader2, RefreshCw, SearchX, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { useToast } from "@/components/feedback/Toast";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { formatNumber } from "../owner/dashboard/format";
import { AiDrawer } from "./AiDrawer";
import { DetailsModal } from "./DetailsModal";
import { FilterCard } from "./FilterCard";
import { EMPTY_FILTERS, activeCount, filtersFromAi, resolvePlaces } from "./filters";
import { MyVisitsModal } from "./MyVisitsModal";
import { PropertyCard } from "./PropertyCard";
import { shareHome } from "./share";
import { loadGeo } from "./use-geo";
import { useHomes } from "./use-homes";
import type { AiResponse, Filters, HomeCardData, SortKey } from "./types";

const SORTS: SortKey[] = ["newest", "price_asc", "price_desc", "area_desc", "popularity"];

export function FindHomeView() {
  const t = useTranslations("owner.findHome");
  const locale = useLocale();
  const toast = useToast();
  const n = formatNumber(locale);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [visitsOpen, setVisitsOpen] = useState(false);
  const homes = useHomes(filters);
  const change = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), []);

  // a shared link (?listing=…) opens that home straight away
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("listing");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) setDetailsId(id);
  }, []);
  const openHome = useCallback((id: string | null) => {
    setDetailsId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("listing", id); else url.searchParams.delete("listing");
    window.history.replaceState(null, "", url);
  }, []);

  /** wishlist heart: shown at once, rolled back with a message if the server refuses */
  const setSaved = useCallback(async (id: string, now: boolean): Promise<boolean> => {
    homes.patch(id, { isFavorite: now });
    try { await authApi(`/me/favorites/${id}`, { method: now ? "PUT" : "DELETE" }); toast("success", t(now ? "card.savedToast" : "card.unsavedToast")); return true; }
    catch (e) { homes.patch(id, { isFavorite: !now }); toast("error", e instanceof ApiError && e.status === 403 ? t("card.saveForbidden") : t("card.saveError")); return false; }
  }, [homes, toast, t]);

  const share = useCallback(async (id: string, title: string) => {
    const r = await shareHome(locale, id, title);
    if (r === "copied") toast("success", t("card.copied"));
    else if (r === "failed") toast("error", t("card.shareError"));
  }, [locale, toast, t]);

  async function applyAi(ai: AiResponse) {
    if (ai.understood === 0) return;
    const places = await resolvePlaces({ division: ai.filters.division, district: ai.filters.district, upazila: ai.filters.upazila, unionName: ai.filters.unionName }, loadGeo);
    setFilters((cur) => ({ ...filtersFromAi(ai.filters, cur), mode: "RENT", ...places })); // this page is rent only
  }

  const hasFilters = activeCount(filters) > 0;

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-48 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 max-w-md text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-11 items-center rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-sm">{t("modeRent")}</span>
          <button type="button" onClick={() => setVisitsOpen(true)} className="btn btn-white h-11 px-4 text-sm"><CalendarClock className="size-4" aria-hidden />{t("myVisits")}</button>
          <button type="button" onClick={() => setAiOpen(true)} className="btn btn-primary h-11 px-5 text-sm"><Sparkles className="size-4" aria-hidden />{t("aiButton")}</button>
        </div>
      </FadeIn>

      <FadeIn delay={0.05}><FilterCard filters={filters} onChange={change} /></FadeIn>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-navy" aria-live="polite">
          {t("results.available")}: <span className="text-lg font-extrabold text-[#0A84F0]">{homes.state === "ready" ? <CountUp value={homes.total} format={n} /> : "–"}</span>
          {homes.fetching && homes.state === "ready" && <Loader2 className="ml-2 inline size-4 animate-spin text-slate-400" aria-label={t("results.updating")} />}
        </p>
        <div className="flex items-center gap-2.5">
          <button type="button" aria-pressed={filters.saved} onClick={() => change({ saved: !filters.saved })}
            className={clsx("inline-flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold transition-all duration-300", filters.saved ? "border-transparent bg-pink-50 text-pink-600 ring-2 ring-pink-200" : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white")}>
            <Heart className={clsx("size-4", filters.saved && "fill-current")} aria-hidden />{t("results.savedOnly")}
          </button>
          <div className="glass-input relative flex h-10 items-center rounded-lg pl-3 pr-8">
            <label htmlFor="fh-sort" className="mr-1.5 whitespace-nowrap text-xs font-semibold text-label">{t("results.sortBy")}:</label>
            <select id="fh-sort" value={filters.sort} onChange={(e) => change({ sort: e.target.value as SortKey })} className="h-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-navy outline-none">
              {SORTS.map((s) => <option key={s} value={s}>{t(`results.sort.${s}`)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-4 text-slate-400" aria-hidden />
          </div>
        </div>
      </div>

      <section aria-label={t("results.aria")} aria-busy={homes.state === "loading" || undefined}>
        {homes.state === "loading" && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">{t("states.loading")}</span>
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[22rem] rounded-2xl" />)}</div>
        )}

        {homes.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("states.error")}</p>
            <button type="button" onClick={homes.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("states.retry")}</button>
          </div>
        )}

        {homes.state === "ready" && homes.items.length === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600">{filters.saved ? <Heart className="size-8" /> : hasFilters ? <SearchX className="size-8" /> : <Home className="size-8" />}</span>
            <h2 className="text-lg font-bold text-navy">{filters.saved ? t("states.emptySavedTitle") : hasFilters ? t("states.noResultsTitle") : t("states.emptyTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{filters.saved ? t("states.emptySavedText") : hasFilters ? t("states.noResultsText") : t("states.emptyText")}</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2.5">
              {(hasFilters || filters.saved) && <button type="button" onClick={() => setFilters({ ...EMPTY_FILTERS, mode: filters.mode, sort: filters.sort })} className="btn btn-white h-10 px-5 text-sm">{t("filters.clearAll")}</button>}
              <button type="button" onClick={() => setAiOpen(true)} className="btn btn-primary h-10 px-5 text-sm"><Sparkles className="size-4" aria-hidden />{t("states.askAi")}</button>
            </div>
          </FadeIn>
        )}

        {homes.items.length > 0 && (
          <>
            <div className={clsx("grid gap-4 transition-opacity duration-300 sm:grid-cols-2 xl:grid-cols-3", homes.fetching && homes.state === "ready" && "opacity-70")}>
              <AnimatePresence initial={false}>
                {homes.items.map((h, i) => <PropertyCard key={h.id} home={h} index={i} onOpen={openHome} onToggleSave={(x: HomeCardData) => void setSaved(x.id, !x.isFavorite)} onShare={(x) => void share(x.id, x.title)} />)}
              </AnimatePresence>
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-xs text-label">{t("results.showing", { shown: n(homes.items.length), total: n(homes.total) })}</p>
              {homes.hasMore && (
                <button type="button" onClick={homes.loadMore} disabled={homes.fetching} className="btn btn-primary h-11 px-7 text-sm">
                  {homes.fetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}{homes.fetching ? t("results.loadingMore") : t("results.loadMore")}
                </button>
              )}
              {homes.moreError && <p role="alert" className="text-sm font-medium text-red-600">{t("results.loadMoreError")}</p>}
            </div>
          </>
        )}
      </section>

      <DetailsModal id={detailsId} onClose={() => openHome(null)} onToggleSave={setSaved} onShare={share} />
      <MyVisitsModal open={visitsOpen} onClose={() => setVisitsOpen(false)} onOpenHome={openHome} />
      <AiDrawer
        open={aiOpen} mode="RENT" onClose={() => setAiOpen(false)} onApply={applyAi}
        onOpenHome={(id) => { setAiOpen(false); openHome(id); }} onShowAll={() => { setAiOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      />
    </div>
  );
}
