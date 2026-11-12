"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { FadeIn } from "@/components/motion/FadeIn";
import { hl } from "@/components/typography/highlight";
import { useAuthQuery } from "@/lib/use-auth-query";
import { MessageModal, type Recipient } from "../owners/MessageModal";
import { BroadcastModal } from "./BroadcastModal";
import { DetailsModal } from "./DetailsModal";
import { ReminderBanners } from "./ReminderBanners";
import { SubKpis } from "./SubKpis";
import { SubTable } from "./SubTable";
import type { Audience, PlanFilter, ReminderPreview, StatusFilter, SubRow, SubStats } from "./types";
import { useSubscriptions } from "./use-subscriptions";

function Reveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return <motion.div initial={{ opacity: 0, y: reduce ? 0 : 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5 }}>{children}</motion.div>;
}

/** Super Admin → Subscriptions: package numbers, bulk reminders, and every owner's plan with direct messages. */
export function SubscriptionsView() {
  const t = useTranslations("admin.subs");
  const [plan, setPlan] = useState<PlanFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const stats = useAuthQuery<SubStats>("/admin/subscriptions/stats");
  const pages = useSubscriptions(plan, status, search);
  const [tick, setTick] = useState(0);
  const [bulk, setBulk] = useState<{ audience: Audience; preview: ReminderPreview } | null>(null);
  const [viewing, setViewing] = useState<SubRow | null>(null);
  const [messaging, setMessaging] = useState<Recipient | null>(null);

  useEffect(() => { const h = setTimeout(() => setSearch(text.trim()), 350); return () => clearTimeout(h); }, [text]);
  const toRecipient = (r: SubRow): Recipient => ({ id: r.userId, fullName: r.owner.fullName, avatarUrl: r.owner.avatarUrl });

  return (
    <div className="space-y-6">
      <FadeIn as="header">
        <h1 className="text-[1.625rem] font-bold leading-snug text-navy">{t.rich("title", { hl })}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("subtitle")}</p>
      </FadeIn>

      <SubKpis data={stats.data} state={stats.state} onRetry={stats.reload} />
      <ReminderBanners tick={tick} onOpen={(audience, preview) => setBulk({ audience, preview })} />
      <Reveal><SubTable plan={plan} onPlan={setPlan} status={status} onStatus={setStatus} text={text} onText={setText} pages={pages} onView={setViewing} onMessage={(r) => setMessaging(toRecipient(r))} /></Reveal>

      <BroadcastModal target={bulk} onClose={() => setBulk(null)} onSent={() => setTick((n) => n + 1)} />
      <DetailsModal row={viewing} onClose={() => setViewing(null)} onMessage={(r) => setMessaging(toRecipient(r))} />
      <MessageModal owner={messaging} onClose={() => setMessaging(null)} />
    </div>
  );
}
