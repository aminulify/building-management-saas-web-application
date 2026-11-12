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
import { MessageModal, type Recipient } from "../owners/MessageModal";
import { EditModal, type StatusInput } from "./EditModal";
import { FreeKpis } from "./FreeKpis";
import { FreeTable } from "./FreeTable";
import type { FreeRow, FreeStats, FreeTab } from "./types";
import { useFree } from "./use-free";
import { ViewModal } from "./ViewModal";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Tenant Free: new sign-ups that are not an owner or a tenant yet, with their NID review and account status. */
export function TenantFreeView() {
  const t = useTranslations("admin.tenantFree");
  const toast = useToast();
  const [tab, setTab] = useState<FreeTab>("all");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const stats = useAuthQuery<FreeStats>("/admin/tenant-free/stats");
  const pages = useFree(tab, search);
  const [viewing, setViewing] = useState<FreeRow | null>(null);
  const [editing, setEditing] = useState<FreeRow | null>(null);
  const [messaging, setMessaging] = useState<Recipient | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);
  const refresh = () => { pages.reload(); stats.reload(); };

  async function save(r: FreeRow, input: StatusInput) {
    setBusy(true);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/tenant-free/${r.id}/status`, { method: "PATCH", body: input });
      toast("success", t(out.changed ? `toast.status.${input.status}` : "toast.same", { name: r.fullName }));
      setEditing(null); refresh();
    } catch (e) {
      toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : t("toast.failed"));
      if (e instanceof ApiError && e.code === "NOT_FOUND") { setEditing(null); refresh(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <FreeKpis data={stats.data} state={stats.state} onRetry={stats.reload} />
      <Reveal><FreeTable tab={tab} onTab={setTab} text={text} onText={setText} pages={pages} onView={setViewing} onEdit={setEditing} /></Reveal>

      <ViewModal row={viewing} onClose={() => setViewing(null)} onMessage={setMessaging} />
      <EditModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} onMessage={setMessaging} onChanged={refresh} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
