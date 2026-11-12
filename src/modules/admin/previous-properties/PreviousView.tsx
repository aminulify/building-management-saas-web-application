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
import { PreviousKpis } from "./PreviousKpis";
import { PreviousTable } from "./PreviousTable";
import { StatusModal, type StatusInput } from "./StatusModal";
import type { ArchiveDetails, ArchiveRow, ArchiveStats, ReasonFilter, StatusFilter } from "./types";
import { usePreviousProperties } from "./use-previous-properties";
import { ViewModal } from "./ViewModal";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Previous Properties: the archive numbers, Reason / Status filters, search, the table and the view / edit & reactivate / delete windows. */
export function PreviousView() {
  const t = useTranslations("admin.previousProperties");
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [reason, setReason] = useState<ReasonFilter>("all");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const stats = useAuthQuery<ArchiveStats>("/admin/previous-properties/stats");
  const pages = usePreviousProperties(status, reason, search);
  const [viewing, setViewing] = useState<ArchiveRow | null>(null);
  const [editing, setEditing] = useState<ArchiveRow | null>(null);
  const [deleting, setDeleting] = useState<ArchiveRow | null>(null);
  const [messaging, setMessaging] = useState<{ id: string; fullName: string; avatarUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);
  const refresh = () => { pages.reload(); stats.reload(); };
  const fail = (e: unknown) => toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : e instanceof ApiError && e.code === "INVALID_STATE" ? t("toast.ownerNotActive") : t("toast.failed"));
  const talk = (o: ArchiveDetails["owner"]) => setMessaging({ id: o.id, fullName: o.fullName, avatarUrl: null });

  async function save(r: ArchiveRow, input: StatusInput) {
    setBusy(true);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/previous-properties/${r.id}/status`, { method: "PATCH", body: input });
      toast("success", t(out.changed ? `toast.status.${input.status}` : "toast.same", { name: r.name }));
      setEditing(null); refresh();
    } catch (e) { fail(e); if (e instanceof ApiError && e.code === "NOT_FOUND") { setEditing(null); refresh(); } } finally { setBusy(false); }
  }
  async function remove(r: ArchiveRow) {
    setBusy(true);
    try {
      const out = await authApi<{ purged: boolean }>(`/admin/previous-properties/${r.id}`, { method: "DELETE", body: {} });
      toast("success", t(out.purged ? "toast.purged" : "toast.kept", { name: r.name }));
      setDeleting(null); refresh();
    } catch (e) { fail(e); setDeleting(null); refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <PreviousKpis data={stats.data} state={stats.state} fetching={stats.fetching} onRetry={stats.reload} />
      <Reveal><PreviousTable status={status} onStatus={setStatus} reason={reason} onReason={setReason} text={text} onText={setText} pages={pages} onView={setViewing} onEdit={setEditing} onDelete={setDeleting} /></Reveal>

      <ViewModal row={viewing} onClose={() => setViewing(null)} onMessage={talk} />
      <StatusModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} onMessage={talk} />
      <DeleteModal row={deleting} busy={busy} onClose={() => setDeleting(null)} onConfirm={(r) => void remove(r)} onMessage={talk} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
