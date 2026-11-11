"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, CalendarClock, ChevronDown, Heart, Home, KeyRound, ListChecks, Loader2, Mountain, Plus, RefreshCw, SearchX, Sparkles, Store } from "lucide-react";
import { clsx } from "clsx";
import { motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { CountUp } from "@/components/motion/CountUp";
import { FadeIn } from "@/components/motion/FadeIn";
import { useToast } from "@/components/feedback/Toast";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { AiDrawer } from "../find-home/AiDrawer";
import { DetailsModal } from "../find-home/DetailsModal";
import { EMPTY_FILTERS, activeCount, filtersFromAi, resolvePlaces } from "../find-home/filters";
import { MyVisitsModal } from "../find-home/MyVisitsModal";
import { shareHome } from "../find-home/share";
import type { AiResponse, Filters, HomeCardData, SortKey } from "../find-home/types";
import { loadGeo } from "../find-home/use-geo";
import { useHomes } from "../find-home/use-homes";
import { useViewerRole } from "../find-home/area";
import { formatNumber } from "../owner/dashboard/format";
import { ContactModal } from "./ContactModal";
import { MarketCard } from "./MarketCard";
import { MarketToolbar } from "./MarketToolbar";
import { MyListingsModal, type MyListing } from "./MyListings";
import { SellModal } from "./SellModal";
import { UpgradeModal } from "./UpgradeModal";

const SORTS: SortKey[] = ["newest", "price_asc", "price_desc", "area_desc", "popularity"];
const BASE: Filters = { ...EMPTY_FILTERS, mode: "SALE" };
/** The grid shows six homes at a time; "Load more" adds the next six. */
const PAGE = 6;

interface Stats { availableForSale: number; availableForRent: number; land: number }

export function MarketView() {
  const t = useTranslations("owner.marketplace");
  const f = useTranslations("owner.findHome");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const toast = useToast();
  const role = useViewerRole();
  const n = formatNumber(locale);

  const [filters, setFilters] = useState<Filters>(BASE);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [contactHome, setContactHome] = useState<HomeCardData | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [visitsOpen, setVisitsOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [sell, setSell] = useState<{ editId: string | null } | null>(null);
  const [upgrade, setUpgrade] = useState<"plan" | "limit" | null>(null);
  const [checking, setChecking] = useState(false);
  const homes = useHomes(filters, PAGE);
  const stats = useAuthQuery<Stats>("/listings/stats");
  const mine = useAuthQuery<{ items: MyListing[] }>("/me/listings?limit=50");
  const change = useCallback((patch: Partial<Filters>) => setFilters((c) => ({ ...c, ...patch })), []);
  const mineLive = useMemo(() => (mine.data?.items ?? []).filter((l) => !["ARCHIVED", "SOLD", "RENTED"].includes(l.status)), [mine.data]);

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

  const setSaved = useCallback(async (id: string, now: boolean): Promise<boolean> => {
    homes.patch(id, { isFavorite: now });
    try { await authApi(`/me/favorites/${id}`, { method: now ? "PUT" : "DELETE" }); toast("success", f(now ? "card.savedToast" : "card.unsavedToast")); return true; }
    catch (e) { homes.patch(id, { isFavorite: !now }); toast("error", e instanceof ApiError && e.status === 403 ? f("card.saveForbidden") : f("card.saveError")); return false; }
  }, [homes, toast, f]);

  const share = useCallback(async (id: string, title: string) => {
    const r = await shareHome(locale, id, title);
    if (r === "copied") toast("success", f("card.copied")); else if (r === "failed") toast("error", f("card.shareError"));
  }, [locale, toast, f]);

  async function applyAi(ai: AiResponse) {
    if (ai.understood === 0) return;
    const places = await resolvePlaces({ division: ai.filters.division, district: ai.filters.district, upazila: ai.filters.upazila, unionName: ai.filters.unionName }, loadGeo);
    setFilters((cur) => ({ ...filtersFromAi(ai.filters, cur), q: "", zoneId: "", ...places }));
  }

  /** Subscription guard: only a person whose plan allows listings gets the form; everyone else sees the plans and a toast. */
  async function createListing() {
    if (checking) return;
    const blocked = (reason: "plan" | "limit") => { toast("error", t("guard.toast")); setUpgrade(reason); };
    if (!["OWNER", "SUPER_ADMIN", "TENANT", "GENERAL_USER"].includes(role)) { blocked("plan"); return; } // the server decides whether the plan allows it
    setChecking(true);
    try { await authApi("/listings/eligibility"); setSell({ editId: null }); }
    catch (e) {
      if (e instanceof ApiError && e.code === "PLAN_LIMIT_REACHED") blocked("limit");
      else if (e instanceof ApiError && (e.code === "LISTING_ENTITLEMENT_REQUIRED" || e.status === 403)) blocked("plan");
      else toast("error", t("guard.error"));
    } finally { setChecking(false); }
  }

  const refreshAll = () => { homes.reload(); stats.reload(); mine.reload(); };
  const hasFilters = activeCount(filters) > 0;
  const s = stats.data;

  const cards: { label: string; value: number | undefined; icon: typeof Home; tone: string }[] = [
    { label: t("stats.forSale"), value: s?.availableForSale, icon: Store, tone: "from-[#F413E6]/15 to-[#48BDFA]/15 text-[#0A84F0]" },
    { label: t("stats.forRent"), value: s?.availableForRent, icon: KeyRound, tone: "from-sky-100 to-indigo-100 text-sky-600" },
    { label: t("stats.land"), value: s?.land, icon: Mountain, tone: "from-emerald-100 to-teal-100 text-emerald-600" },
    { label: t("stats.mine"), value: mine.state === "ready" ? mineLive.length : undefined, icon: ListChecks, tone: "from-pink-100 to-orange-100 text-pink-600" },
  ];

  return (
    <div className="relative space-y-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 top-56 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />

      <FadeIn as="header" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-[1.7rem]">{t.rich("title", { hl })}</h1>
          <p className="mt-1 max-w-lg text-sm text-slate-600">{t("subtitle")}</p>
        </div>
        <button type="button" onClick={() => void createListing()} disabled={checking} className="btn btn-primary h-11 px-6 text-sm">
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}{t("createListing")}
        </button>
      </FadeIn>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label={t("stats.aria")}>
        {cards.map((c, i) => (
          <motion.div
            key={c.label} initial={{ opacity: 0, y: reduce ? 0 : 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.06 }}
            className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.28)] motion-reduce:hover:translate-y-0"
          >
            <span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${c.tone}`}><c.icon className="size-5" /></span>
            <div className="min-w-0"><p className="text-xs font-semibold uppercase leading-tight tracking-wide text-label">{c.label}</p>
              <p className="text-2xl font-extrabold text-navy">{c.value === undefined ? <span className="skeleton inline-block h-7 w-12 rounded" aria-label={f("states.loading")} /> : <CountUp value={c.value} format={n} />}</p></div>
          </motion.div>
        ))}
      </div>

      <FadeIn delay={0.05}><MarketToolbar filters={filters} onChange={change} /></FadeIn>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-navy" aria-live="polite">
          {t("available")}: <span className="text-lg font-extrabold text-[#0A84F0]">{homes.state === "ready" ? <CountUp value={homes.total} format={n} /> : "–"}</span>
          {homes.fetching && homes.state === "ready" && <Loader2 className="ml-2 inline size-4 animate-spin text-slate-400" aria-label={f("results.updating")} />}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => setMineOpen(true)} className="btn btn-white h-10 px-3.5 text-sm"><ListChecks className="size-4" aria-hidden />{t("myListings")}{mine.state === "ready" && mine.data && mine.data.items.length > 0 && <span className="rounded-full bg-sky-100 px-1.5 text-[0.7rem] font-bold text-sky-700">{n(mine.data.items.length)}</span>}</button>
          <button type="button" onClick={() => setVisitsOpen(true)} className="btn btn-white h-10 px-3.5 text-sm"><CalendarClock className="size-4" aria-hidden />{f("myVisits")}</button>
          <button type="button" onClick={() => setAiOpen(true)} className="btn btn-glass h-10 px-3.5 text-sm"><Sparkles className="size-4 text-[#F413E6]" aria-hidden />{f("aiButton")}</button>
          <button type="button" aria-pressed={filters.saved} onClick={() => change({ saved: !filters.saved })}
            className={clsx("inline-flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold transition-all duration-300", filters.saved ? "border-transparent bg-pink-50 text-pink-600 ring-2 ring-pink-200" : "border-slate-200 bg-white/70 text-slate-600 hover:bg-white")}>
            <Heart className={clsx("size-4", filters.saved && "fill-current")} aria-hidden />{f("results.savedOnly")}
          </button>
          <div className="glass-input relative flex h-10 items-center rounded-lg pl-3 pr-8">
            <label htmlFor="mk-sort" className="mr-1.5 whitespace-nowrap text-xs font-semibold text-label">{f("results.sortBy")}:</label>
            <select id="mk-sort" value={filters.sort} onChange={(e) => change({ sort: e.target.value as SortKey })} className="h-full cursor-pointer appearance-none bg-transparent text-sm font-semibold text-navy outline-none">
              {SORTS.map((k) => <option key={k} value={k}>{f(`results.sort.${k}`)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-4 text-slate-400" aria-hidden />
          </div>
        </div>
      </div>

      <section aria-label={f("results.aria")} aria-busy={homes.state === "loading" || undefined}>
        {homes.state === "loading" && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">{f("states.loading")}</span>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-[26rem] rounded-2xl" />)}</div>
        )}
        {homes.state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-12 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("states.error")}</p>
            <button type="button" onClick={homes.reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{f("states.retry")}</button>
          </div>
        )}
        {homes.state === "ready" && homes.items.length === 0 && (
          <FadeIn className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-14 text-center backdrop-blur-md">
            <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-sky-100 text-sky-600">{filters.saved ? <Heart className="size-8" /> : hasFilters ? <SearchX className="size-8" /> : <Store className="size-8" />}</span>
            <h2 className="text-lg font-bold text-navy">{filters.saved ? f("states.emptySavedTitle") : hasFilters ? f("states.noResultsTitle") : t("states.emptyTitle")}</h2>
            <p className="max-w-sm text-sm text-slate-600">{filters.saved ? f("states.emptySavedText") : hasFilters ? f("states.noResultsText") : t("states.emptyText")}</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2.5">
              {(hasFilters || filters.saved) && <button type="button" onClick={() => setFilters({ ...BASE, mode: filters.mode, sort: filters.sort })} className="btn btn-white h-10 px-5 text-sm">{f("filters.clearAll")}</button>}
              <button type="button" onClick={() => void createListing()} className="btn btn-primary h-10 px-5 text-sm"><Plus className="size-4" aria-hidden />{t("createListing")}</button>
            </div>
          </FadeIn>
        )}
        {homes.items.length > 0 && (
          <>
            <div className={clsx("grid gap-4 transition-opacity duration-300 sm:grid-cols-2 xl:grid-cols-3", homes.fetching && homes.state === "ready" && "opacity-70")}>
              {homes.items.map((h, i) => <MarketCard key={h.id} home={h} index={i} onOpen={openHome} onContact={setContactHome} onToggleSave={(x) => void setSaved(x.id, !x.isFavorite)} onShare={(x) => void share(x.id, x.title)} />)}
            </div>
            <div className="mt-6 flex flex-col items-center gap-2">
              <p className="text-xs text-label">{f("results.showing", { shown: n(homes.items.length), total: n(homes.total) })}</p>
              {homes.hasMore && <button type="button" onClick={homes.loadMore} disabled={homes.fetching} className="btn btn-primary h-11 px-7 text-sm">{homes.fetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />}{homes.fetching ? f("results.loadingMore") : f("results.loadMore")}</button>}
              {homes.moreError && <p role="alert" className="text-sm font-medium text-red-600">{f("results.loadMoreError")}</p>}
            </div>
          </>
        )}
      </section>

      <DetailsModal id={detailsId} onClose={() => openHome(null)} onToggleSave={setSaved} onShare={share} market />
      <ContactModal home={contactHome} onClose={() => setContactHome(null)} />
      <MyVisitsModal open={visitsOpen} onClose={() => setVisitsOpen(false)} onOpenHome={openHome} />
      <MyListingsModal open={mineOpen} onClose={() => setMineOpen(false)} onEdit={(id) => setSell({ editId: id })} onView={(id) => { setMineOpen(false); openHome(id); }} onChanged={refreshAll} />
      {sell && <SellModal open editId={sell.editId} onClose={() => setSell(null)} onDone={refreshAll} />}
      <UpgradeModal open={upgrade !== null} reason={upgrade ?? "plan"} onClose={() => setUpgrade(null)} />
      <AiDrawer
        open={aiOpen} mode={filters.mode} onClose={() => setAiOpen(false)} onApply={applyAi}
        examples={[t("ai.ex1"), t("ai.ex2"), t("ai.ex3")]}
        onOpenHome={(id) => { setAiOpen(false); openHome(id); }} onShowAll={() => { setAiOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
      />
    </div>
  );
}
