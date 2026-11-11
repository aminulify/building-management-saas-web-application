"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { DeleteModal, StateModal } from "./HomeActionModals";
import { HomeKpis } from "./HomeKpis";
import { HomeTable } from "./HomeTable";
import { HomeViewModal } from "./HomeViewModal";
import type { ModerationState } from "./state";
import type { HomeFilters, HomeRow, HomeStats, Mode } from "./types";
import { useHomePages } from "./use-home-pages";

const DEFAULTS = (mode: Mode): HomeFilters => ({ mode, status: "all", occupancy: "all", sale: "all" });

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Manage Home: moderate rental listings (Find Home) and buy / sell listings (Marketplace). */
export function ManageHomeView() {
  const t = useTranslations("admin.manageHome");
  const toast = useToast();
  const [filters, setFilters] = useState<HomeFilters>(DEFAULTS("rent")); // this page moderates rental listings; marketplace listings get their own page (Manage Marketplace)
  const pages = useHomePages(filters);
  const stats = useAuthQuery<HomeStats>(`/admin/manage-home/stats?mode=${filters.mode}`);
  const [viewing, setViewing] = useState<HomeRow | null>(null);
  const [editing, setEditing] = useState<HomeRow | null>(null);
  const [deleting, setDeleting] = useState<HomeRow | null>(null);

  async function saveState(state: ModerationState) {
    const row = editing;
    if (!row) return;
    try {
      await authApi(`/admin/manage-home/${row.id}/state`, { method: "PATCH", body: { state } });
      pages.applyState(row.id, state);
      stats.reload();
      toast("success", t("toast.changed", { title: row.title, state: t(`state.${state}`) }));
      setEditing(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_FOUND") { pages.remove(row.id); stats.reload(); setEditing(null); toast("error", t("toast.gone")); return; }
      const reason = e instanceof ApiError && e.code === "INVALID_STATE" ? (e.details as { reason?: string } | undefined)?.reason : undefined;
      toast("error", reason === "sold_or_rented" ? t("toast.closedDeal") : t("toast.failed"));
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
      if (e instanceof ApiError && e.code === "NOT_FOUND") { pages.remove(row.id); stats.reload(); setDeleting(null); toast("error", t("toast.gone")); return; }
      toast("error", t("toast.failed"));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <FadeIn as="header">
          <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </FadeIn>
      </div>

      <HomeKpis data={stats.data?.mode === filters.mode ? stats.data : null} state={stats.state} onRetry={stats.reload} />

      <Reveal><HomeTable filters={filters} onFilters={setFilters} pages={pages} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} /></Reveal>

      <HomeViewModal row={viewing} onClose={() => setViewing(null)} />
      <StateModal row={editing} onClose={() => setEditing(null)} onSave={saveState} />
      <DeleteModal row={deleting} onClose={() => setDeleting(null)} onConfirm={archive} />
    </div>
  );
}
