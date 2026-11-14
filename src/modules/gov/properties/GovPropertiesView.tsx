"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { useAuthQuery } from "@/lib/use-auth-query";
import { MessageModal } from "../../admin/owners/MessageModal";
import { GovKpis } from "./GovKpis";
import { GovPropertyModal } from "./GovPropertyModal";
import { GovTable } from "./GovTable";
import type { GovStats, PropertyRow, Tab } from "./types";
import { useGovProperties } from "./use-gov-properties";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Government Admin → All Properties: the numbers, the Active / Pending tabs, the table with View More / View Less, and the property window. Read-only. */
export function GovPropertiesView() {
  const t = useTranslations("gov.properties");
  const [tab, setTab] = useState<Tab>("all");
  const pages = useGovProperties(tab);
  const stats = useAuthQuery<GovStats>("/gov/properties/stats");
  const [viewing, setViewing] = useState<PropertyRow | null>(null);
  const [messaging, setMessaging] = useState<{ id: string; fullName: string; avatarUrl: string | null } | null>(null);

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <GovKpis data={stats.data} state={stats.state} onRetry={stats.reload} />
      <Reveal><GovTable tab={tab} onTab={setTab} pages={pages} onView={setViewing} /></Reveal>

      <GovPropertyModal row={viewing} onClose={() => setViewing(null)} onMessage={setMessaging} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
