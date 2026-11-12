"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { dhakaToday } from "../../dashboards/admin-range";
import { DateRange } from "../dashboard/DateRange";
import { CategoryCard } from "./CategoryCard";
import { DeleteModal } from "./DeleteModal";
import { DetailsModal } from "./DetailsModal";
import { EditModal, type EditInput } from "./EditModal";
import { MaintenanceKpis } from "./MaintenanceKpis";
import { RequestsTable } from "./RequestsTable";
import { ticket, type MaintStats, type ReqFilters, type ReqRow } from "./types";
import { useRequests } from "./use-requests";

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: reduce ? 0 : delay }}>{children}</motion.div>;
}
const daysBefore = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** Super Admin → Active Maintenance: numbers and category shares for the chosen dates, and every request with view / edit / delete. */
export function MaintenanceView() {
  const t = useTranslations("admin.maintenance");
  const toast = useToast();
  const [range, setRange] = useState(() => { const to = dhakaToday(); return { from: daysBefore(to, 29), to }; });
  const [filters, setFilters] = useState<ReqFilters>({ status: "all", priority: "all", category: null, q: "" });
  const [text, setText] = useState("");
  const invalid = !range.from || !range.to || range.from > range.to;
  const statsPath = useMemo(() => (invalid ? null : `/admin/maintenance/stats?from=${range.from}&to=${range.to}`), [invalid, range]);
  const stats = useAuthQuery<MaintStats>(statsPath);
  const pages = useRequests(filters);
  const [viewing, setViewing] = useState<ReqRow | null>(null);
  const [editing, setEditing] = useState<ReqRow | null>(null);
  const [deleting, setDeleting] = useState<ReqRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setFilters((f) => (f.q === text.trim() ? f : { ...f, q: text.trim() })), 350); return () => clearTimeout(h); }, [text]);

  const refresh = () => { pages.reload(); stats.reload(); };
  const gone = (e: unknown) => toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed"));

  async function save(r: ReqRow, input: EditInput) {
    setBusy(true);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/maintenance/${r.id}`, { method: "PATCH", body: input });
      toast("success", t(out.changed ? "toast.saved" : "toast.same", { ticket: ticket(r.ticketNo) }));
      setEditing(null); refresh();
    } catch (e) { gone(e); if (e instanceof ApiError && e.code === "NOT_FOUND") { setEditing(null); refresh(); } } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try { await authApi(`/admin/maintenance/${deleting.id}`, { method: "DELETE" }); toast("success", t("toast.deleted", { ticket: ticket(deleting.ticketNo) })); setDeleting(null); refresh(); }
    catch (e) { gone(e); setDeleting(null); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <FadeIn as="header">
          <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </FadeIn>
        <FadeIn delay={0.08}><DateRange from={range.from} to={range.to} invalid={invalid} fetching={stats.fetching} onChange={setRange} /></FadeIn>
      </div>

      <MaintenanceKpis data={stats.data} state={stats.state} fetching={stats.fetching} onRetry={stats.reload} />
      <Reveal><CategoryCard data={stats.data} state={stats.state} category={filters.category} onCategory={(c) => setFilters((f) => ({ ...f, category: c }))} onRetry={stats.reload} /></Reveal>
      <Reveal><RequestsTable filters={filters} onFilters={(p) => setFilters((f) => ({ ...f, ...p }))} text={text} onText={setText} pages={pages} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} /></Reveal>

      <DetailsModal row={viewing} onClose={() => setViewing(null)} />
      <EditModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} />

      <DeleteModal row={deleting} busy={busy} onClose={() => setDeleting(null)} onConfirm={() => void remove()} />
    </div>
  );
}
