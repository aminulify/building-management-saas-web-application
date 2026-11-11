"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { AddModal } from "./AddModal";
import { ConfirmModal, EditModal, type Choice } from "./EditModals";
import { PropertyKpis } from "./PropertyKpis";
import { PropertyTable } from "./PropertyTable";
import type { PropertyRow, PropertyStats, Tab } from "./types";
import { usePropertyPages } from "./use-property-pages";
import { ViewModal } from "./ViewModal";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Properties: counters, the table, and the view / edit / delete / add windows. Everything is read from and written to the database. */
export function PropertiesView() {
  const t = useTranslations("admin.properties");
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("all");
  const pages = usePropertyPages(tab);
  const stats = useAuthQuery<PropertyStats>("/admin/properties/stats");
  const [viewing, setViewing] = useState<PropertyRow | null>(null);
  const [editing, setEditing] = useState<PropertyRow | null>(null);
  const [choice, setChoice] = useState<Choice>("ACTIVE");
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);

  const openEdit = (r: PropertyRow) => { setEditing(r); setChoice(r.state === "ACTIVE" ? "ACTIVE" : "PENDING"); setConfirming(false); };
  const closeEdit = () => { setEditing(null); setConfirming(false); };

  /** the change is made only here, after "Yes" */
  async function apply() {
    const row = editing;
    if (!row) return;
    try {
      if (choice === "DELETE") {
        const res = await authApi<{ tenantsMovedOut: number }>(`/admin/properties/${row.id}`, { method: "DELETE" });
        pages.remove(row.id);
        toast("success", res.tenantsMovedOut > 0 ? t("toast.deletedTenants", { name: row.name, count: res.tenantsMovedOut }) : t("toast.deleted", { name: row.name }));
      } else {
        await authApi(`/admin/properties/${row.id}/status`, { method: "PATCH", body: { status: choice } });
        pages.applyState(row.id, choice);
        toast("success", t("toast.changed", { name: row.name, status: t(`state.${choice}`) }));
      }
      closeEdit();
      stats.reload();
    } catch (e) {
      toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed"));
      if (e instanceof ApiError && e.code === "NOT_FOUND") { pages.remove(row.id); stats.reload(); closeEdit(); }
      else setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <FadeIn as="header">
          <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </FadeIn>
        <FadeIn delay={0.08}><button type="button" onClick={() => setAdding(true)} className="btn btn-primary h-11 px-5 text-sm"><Plus className="size-4" aria-hidden />{t("addBtn")}</button></FadeIn>
      </div>

      <PropertyKpis data={stats.data} state={stats.state} onRetry={stats.reload} />

      <Reveal><PropertyTable tab={tab} onTab={setTab} pages={pages} onView={setViewing} onEdit={openEdit} /></Reveal>

      <ViewModal row={viewing} onClose={() => setViewing(null)} />
      <EditModal row={editing} open={!!editing && !confirming} choice={choice} onChoice={setChoice} onSave={() => setConfirming(true)} onClose={closeEdit} />
      <ConfirmModal row={editing} open={!!editing && confirming} choice={choice} onConfirm={apply} onBack={() => setConfirming(false)} />
      <AddModal open={adding} onClose={() => setAdding(false)} onCreated={() => { pages.reload(); stats.reload(); }} />
    </div>
  );
}
