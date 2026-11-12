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
import { EditModal, type EditInput } from "./EditModal";
import { TenantsKpis } from "./TenantsKpis";
import { TenantsTable } from "./TenantsTable";
import type { TenantRow, TenantStats, TenantTab, VerificationFilter } from "./types";
import { useTenants } from "./use-tenants";
import { ViewModal } from "./ViewModal";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Active Tenants: the numbers, the tenants with a running lease, and the view / edit / message windows. */
export function TenantsView() {
  const t = useTranslations("admin.tenants");
  const toast = useToast();
  const [tab, setTab] = useState<TenantTab>("all");
  const [verification, setVerification] = useState<VerificationFilter>("all");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const stats = useAuthQuery<TenantStats>("/admin/active-tenants/stats");
  const pages = useTenants(tab, verification, search);
  const [viewing, setViewing] = useState<TenantRow | null>(null);
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [messaging, setMessaging] = useState<Recipient | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);
  const refresh = () => { pages.reload(); stats.reload(); };

  async function save(r: TenantRow, input: EditInput) {
    setBusy(true);
    try {
      const out = await authApi<{ changed: boolean }>(`/admin/active-tenants/${r.id}`, { method: "PATCH", body: input });
      toast("success", t(out.changed ? "toast.saved" : "toast.same", { name: r.tenant.fullName }));
      setEditing(null); refresh();
    } catch (e) {
      const why = e instanceof ApiError && e.code === "INVALID_STATE" ? (e.details as { reason?: string } | undefined)?.reason : undefined;
      toast("error", e instanceof ApiError && e.code === "NOT_FOUND" ? t("toast.gone") : why === "unit_not_free" ? t("toast.unitTaken") : t("toast.failed"));
      if (e instanceof ApiError && (e.code === "NOT_FOUND" || why === "unit_not_free")) { setEditing(null); refresh(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <TenantsKpis data={stats.data} state={stats.state} onRetry={stats.reload} />
      <Reveal><TenantsTable tab={tab} onTab={setTab} verification={verification} onVerification={setVerification} text={text} onText={setText} pages={pages} onView={setViewing} onEdit={setEditing} /></Reveal>

      <ViewModal row={viewing} onClose={() => setViewing(null)} onMessage={setMessaging} />
      <EditModal row={editing} busy={busy} onClose={() => setEditing(null)} onSave={(r, i) => void save(r, i)} onMessage={setMessaging} onChanged={refresh} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
