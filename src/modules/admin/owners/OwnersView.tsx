"use client";

import { useEffect, useMemo, useState } from "react";
import { Store, Home } from "lucide-react";
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
import { DeleteModal } from "./DeleteModal";
import { MessageModal } from "./MessageModal";
import { OwnersKpis } from "./OwnersKpis";
import { OwnersTable } from "./OwnersTable";
import { StatusModal, type StatusInput } from "./StatusModal";
import type { Mode, OwnerDetails, OwnerRow, OwnerStats, StatusFilter, Tier, VerificationFilter } from "./types";
import { useOwners } from "./use-owners";
import { ViewModal } from "./ViewModal";

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: reduce ? 0 : delay }}>{children}</motion.div>;
}
const daysBefore = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);

/** Super Admin → Active Owners: numbers for the chosen dates, plan tabs, the owners table (rental or marketplace) and the view / edit status / delete / message windows. */
export function OwnersView() {
  const t = useTranslations("admin.owners");
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("rental");
  const [tier, setTier] = useState<Tier>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [verification, setVerification] = useState<VerificationFilter>("all");
  const [range, setRange] = useState(() => { const to = dhakaToday(); return { from: daysBefore(to, 29), to }; });
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const invalid = !range.from || !range.to || range.from > range.to;
  const statsPath = useMemo(() => (invalid ? null : `/admin/active-owners/stats?from=${range.from}&to=${range.to}&mode=${mode}`), [invalid, range, mode]);
  const stats = useAuthQuery<OwnerStats>(statsPath);
  const pages = useOwners(mode, tier, status, verification, search);
  const [viewing, setViewing] = useState<OwnerRow | null>(null);
  const [editing, setEditing] = useState<OwnerRow | null>(null);
  const [deleting, setDeleting] = useState<OwnerRow | null>(null);
  const [messaging, setMessaging] = useState<OwnerDetails | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);
  const refresh = () => { pages.reload(); stats.reload(); };
  const fail = (e: unknown) => toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed"));

  async function save(r: OwnerRow, input: StatusInput) {
    setBusy(true);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/active-owners/${r.id}/status`, { method: "PATCH", body: input });
      toast("success", t(out.changed ? `toast.status.${input.status}` : "toast.same", { name: r.fullName }));
      setEditing(null); refresh();
    } catch (e) { fail(e); if (e instanceof ApiError && e.code === "NOT_FOUND") { setEditing(null); refresh(); } } finally { setBusy(false); }
  }
  async function remove(r: OwnerRow) {
    setBusy(true);
    try { await authApi(`/admin/active-owners/${r.id}`, { method: "DELETE", body: {} }); toast("success", t("toast.archived", { name: r.fullName })); setDeleting(null); refresh(); }
    catch (e) { fail(e); setDeleting(null); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <FadeIn as="header">
          <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
        </FadeIn>
        <FadeIn delay={0.08} className="flex flex-wrap items-start gap-3">
          <DateRange from={range.from} to={range.to} invalid={invalid} fetching={stats.fetching} onChange={setRange} />
          <button type="button" onClick={() => { setMode(mode === "rental" ? "market" : "rental"); setTier("all"); setStatus("all"); setVerification("all"); }} aria-pressed={mode === "market"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-navy px-5 text-sm font-bold uppercase tracking-wide text-white shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-[#48BDFA] motion-reduce:hover:translate-y-0">
            {mode === "rental" ? <Store className="size-4" aria-hidden /> : <Home className="size-4" aria-hidden />}{t(mode === "rental" ? "toggle.market" : "toggle.rental")}
          </button>
        </FadeIn>
      </div>

      <OwnersKpis data={stats.data} state={stats.state} fetching={stats.fetching} mode={mode} onRetry={stats.reload} />
      <Reveal><OwnersTable mode={mode} tier={tier} onTier={setTier} status={status} onStatus={setStatus} verification={verification} onVerification={setVerification} text={text} onText={setText} pages={pages} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} /></Reveal>

      <ViewModal row={viewing} onClose={() => setViewing(null)} onMessage={setMessaging} />
      <StatusModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} onMessage={setMessaging} onChanged={refresh} />
      <DeleteModal row={deleting} busy={busy} onClose={() => setDeleting(null)} onConfirm={(r) => void remove(r)} onMessage={setMessaging} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
