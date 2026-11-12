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
import { OwnersKpis } from "./OwnersKpis";
import { OwnersTable } from "./OwnersTable";
import { StatusModal, type StateInput } from "./StatusModal";
import type { ArchiveDetails, ArchiveRow, ArchiveStats, ReasonFilter, StatusFilter } from "./types";
import { usePreviousOwners } from "./use-previous-owners";
import { ViewModal } from "./ViewModal";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Previous Owners: the archive numbers, Reason / Status filters, name / ID search, the table and the view / edit & reactivate / delete windows. */
export function PreviousView() {
  const t = useTranslations("admin.previousOwners");
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [reason, setReason] = useState<ReasonFilter>("all");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const stats = useAuthQuery<ArchiveStats>("/admin/previous-owners/stats");
  const pages = usePreviousOwners(status, reason, search);
  const [viewing, setViewing] = useState<ArchiveRow | null>(null);
  const [editing, setEditing] = useState<ArchiveRow | null>(null);
  const [deleting, setDeleting] = useState<ArchiveRow | null>(null);
  const [messaging, setMessaging] = useState<{ id: string; fullName: string; avatarUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);
  const refresh = () => { pages.reload(); stats.reload(); };
  const fail = (e: unknown) => toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed"));
  const talk = (d: ArchiveDetails) => setMessaging({ id: d.id, fullName: d.fullName, avatarUrl: d.avatarUrl });

  async function save(r: ArchiveRow, input: StateInput) {
    setBusy(true);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/previous-owners/${r.id}/status`, { method: "PATCH", body: input });
      toast("success", t(out.changed ? `toast.status.${input.status}` : "toast.same", { name: r.fullName }));
      setEditing(null); refresh();
    } catch (e) { fail(e); if (e instanceof ApiError && e.code === "NOT_FOUND") { setEditing(null); refresh(); } } finally { setBusy(false); }
  }
  async function remove(r: ArchiveRow) {
    setBusy(true);
    try {
      const out = await authApi<{ purged: boolean }>(`/admin/previous-owners/${r.id}`, { method: "DELETE", body: {} });
      toast("success", t(out.purged ? "toast.purged" : "toast.kept", { name: r.fullName }));
      setDeleting(null); refresh();
    } catch (e) { fail(e); setDeleting(null); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <OwnersKpis data={stats.data} state={stats.state} fetching={stats.fetching} onRetry={stats.reload} />
      <Reveal><OwnersTable status={status} onStatus={setStatus} reason={reason} onReason={setReason} text={text} onText={setText} pages={pages} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} /></Reveal>

      <ViewModal row={viewing} onClose={() => setViewing(null)} onMessage={talk} />
      <StatusModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} onMessage={talk} />
      <DeleteModal row={deleting} busy={busy} onClose={() => setDeleting(null)} onConfirm={(r) => void remove(r)} onMessage={talk} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
