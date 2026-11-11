"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, SearchX, Store } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { DeleteModal, StateModal } from "../manage-home/HomeActionModals";
import { HomeViewModal } from "../manage-home/HomeViewModal";
import type { ModerationState } from "../manage-home/state";
import type { HomeFilters, HomeRow, HomeStats } from "../manage-home/types";
import { useHomePages } from "../manage-home/use-home-pages";
import { ListingCard } from "./ListingCard";
import { MarketKpis } from "./MarketKpis";
import { DEFAULT_FILTERS, filtersActive, MarketToolbar } from "./MarketToolbar";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Manage Marketplace: approve, reject, report, feature, inspect and delete every buy / sell listing. */
export function ManageMarketplaceView() {
  const t = useTranslations("admin.manageMarket");
  const toast = useToast();
  const [filters, setFilters] = useState<HomeFilters>(DEFAULT_FILTERS);
  const pages = useHomePages(filters);
  const stats = useAuthQuery<HomeStats>("/admin/manage-home/stats?mode=sale");
  const [viewing, setViewing] = useState<HomeRow | null>(null);
  const [editing, setEditing] = useState<HomeRow | null>(null);
  const [deleting, setDeleting] = useState<HomeRow | null>(null);
  const [featuring, setFeaturing] = useState<string | null>(null);
  const { items, total, state, more, hasMore, loadMore, reload } = pages;

  const gone = (row: HomeRow) => { pages.remove(row.id); stats.reload(); toast("error", t("toast.gone")); };

  async function saveState(next: ModerationState, sold?: boolean) {
    const row = editing;
    if (!row) return;
    try {
      await authApi(`/admin/manage-home/${row.id}/state`, { method: "PATCH", body: { state: next, ...(sold === undefined ? {} : { sold }) } });
      pages.applyState(row.id, next, sold);
      stats.reload();
      toast("success", sold === true ? t("toast.sold", { title: row.title }) : sold === false ? t("toast.forSale", { title: row.title }) : t("toast.changed", { title: row.title, state: t(`state.${next}`) }));
      setEditing(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_FOUND") { setEditing(null); gone(row); return; }
      const reason = e instanceof ApiError && e.code === "INVALID_STATE" ? (e.details as { reason?: string } | undefined)?.reason : undefined;
      toast("error", reason === "sold_or_rented" ? t("toast.closedDeal") : reason === "not_live" ? t("toast.notLiveSold") : t("toast.failed"));
    }
  }

  async function archive() {
    const row = deleting;
    if (!row) return;
    try {
      await authApi(`/admin/manage-home/${row.id}`, { method: "DELETE" });
      pages.remove(row.id);
      stats.reload();
      toast("success", t("toast.archived", { title: row.title }));
      setDeleting(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_FOUND") { setDeleting(null); gone(row); return; }
      toast("error", t("toast.failed"));
    }
  }

  async function toggleFeature(row: HomeRow) {
    const want = !row.isFeatured;
    setFeaturing(row.id);
    try {
      await authApi(`/admin/manage-home/${row.id}/feature`, { method: "PATCH", body: { featured: want } });
      pages.applyFeatured(row.id, want);
      stats.reload();
      toast("success", t(want ? "toast.featured" : "toast.unfeatured", { title: row.title }));
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_FOUND") gone(row);
      else toast("error", e instanceof ApiError && e.code === "INVALID_STATE" ? t("toast.notLive") : t("toast.failed"));
    } finally { setFeaturing(null); }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <MarketKpis data={stats.data} state={stats.state} onRetry={stats.reload} />

      <Reveal><MarketToolbar filters={filters} onFilters={setFilters} total={state === "ready" ? total : null} /></Reveal>

      <section aria-label={t("listTitle")} aria-busy={state === "loading" || undefined}>
        {state === "loading" && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[26rem] rounded-2xl" />)}<span className="sr-only">{t("loading")}</span></div>}

        {state === "error" && (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-14 text-center text-red-700">
            <AlertTriangle className="size-8" aria-hidden /><p className="font-semibold">{t("error")}</p>
            <button type="button" onClick={reload} className="btn btn-white h-10 px-5 text-sm"><RefreshCw className="size-4" aria-hidden />{t("retry")}</button>
          </div>
        )}

        <AnimatePresence>
          {state === "ready" && items.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass-card flex flex-col items-center gap-2 px-4 py-14 text-center">
              <span aria-hidden className="grid size-14 place-items-center rounded-full bg-sky-100 text-sky-600">{filtersActive(filters) ? <SearchX className="size-7" /> : <Store className="size-7" />}</span>
              <p className="font-semibold text-navy">{t("emptyTitle")}</p><p className="text-sm text-slate-600">{t(filtersActive(filters) ? "empty.filtered" : "empty.none")}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {state === "ready" && items.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((r, i) => <ListingCard key={r.id} row={r} index={i} busyFeature={featuring === r.id} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} onFeature={(x) => void toggleFeature(x)} />)}
            </div>
            {(hasMore || more === "error") && (
              <div className="mt-5 flex flex-col items-center gap-2">
                {more === "error" && <p role="alert" className="text-xs font-medium text-red-600">{t("moreError")}</p>}
                <button type="button" onClick={loadMore} disabled={more === "loading"} aria-busy={more === "loading" || undefined} className="btn btn-white h-11 px-6 text-sm font-bold text-[#0A84F0]">
                  {more === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}{more === "loading" ? t("loadingMore") : t("viewMore")}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <HomeViewModal row={viewing} onClose={() => setViewing(null)} />
      <StateModal row={editing} onClose={() => setEditing(null)} onSave={saveState} withSale />
      <DeleteModal row={deleting} onClose={() => setDeleting(null)} onConfirm={archive} />
    </div>
  );
}
