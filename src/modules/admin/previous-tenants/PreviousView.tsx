"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { useAuthQuery } from "@/lib/use-auth-query";
import { MessageModal } from "../owners/MessageModal";
import { DeleteModal } from "./DeleteModal";
import { EditModal, type RecordInput } from "./EditModal";
import { firstName } from "./logic";
import type { Person } from "./TenantFrame";
import { TenantsKpis } from "./TenantsKpis";
import { TenantsTable } from "./TenantsTable";
import type { ArchiveRow, ArchiveStats, ReasonFilter, RentFilter } from "./types";
import { usePreviousTenants } from "./use-previous-tenants";
import { ViewModal } from "./ViewModal";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Previous Tenants: the archive numbers, Reason / Rent Status filters, name / ID search, the table and the view / edit / delete windows. */
export function PreviousView() {
  const t = useTranslations("admin.previousTenants");
  const toast = useToast();
  const [rent, setRent] = useState<RentFilter>("all");
  const [reason, setReason] = useState<ReasonFilter>("all");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const stats = useAuthQuery<ArchiveStats>("/admin/previous-tenants/stats");
  const pages = usePreviousTenants(rent, reason, search);
  const [viewing, setViewing] = useState<ArchiveRow | null>(null);
  const [editing, setEditing] = useState<ArchiveRow | null>(null);
  const [deleting, setDeleting] = useState<ArchiveRow | null>(null);
  const [messaging, setMessaging] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);
  const refresh = () => { pages.reload(); stats.reload(); };
  const fail = (e: unknown) => toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed"));

  async function save(r: ArchiveRow, input: RecordInput) {
    setBusy(true);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/previous-tenants/${r.id}`, { method: "PATCH", body: { rentStatus: input.rentStatus, reason: input.reason, note: input.note ?? "" } });
      toast("success", t(out.changed ? "toast.saved" : "toast.same", { name: firstName(r.tenant.fullName) }));
      setEditing(null); refresh();
    } catch (e) { fail(e); if (e instanceof ApiError && e.code === "NOT_FOUND") { setEditing(null); refresh(); } } finally { setBusy(false); }
  }
  async function remove(r: ArchiveRow) {
    setBusy(true);
    try {
      const out = await authApi<{ purged: boolean }>(`/admin/previous-tenants/${r.id}`, { method: "DELETE", body: {} });
      toast("success", t(out.purged ? "toast.purged" : "toast.kept", { name: firstName(r.tenant.fullName) }));
      setDeleting(null); refresh();
    } catch (e) { fail(e); setDeleting(null); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <TenantsKpis data={stats.data} state={stats.state} fetching={stats.fetching} onRetry={stats.reload} />
      <Reveal><TenantsTable rent={rent} onRent={setRent} reason={reason} onReason={setReason} text={text} onText={setText} pages={pages} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} /></Reveal>

      <ViewModal row={viewing} onClose={() => setViewing(null)} onMessage={setMessaging} />
      <EditModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} onMessage={setMessaging} />
      <DeleteModal row={deleting} busy={busy} onClose={() => setDeleting(null)} onConfirm={(r) => void remove(r)} onMessage={setMessaging} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
