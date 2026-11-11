"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/feedback/Modal";
import { Link } from "@/i18n/navigation";
import { useDescribe } from "./describe";
import { kindOf, storyRef } from "./logic";
import type { Notification } from "./types";
import { AlertStory } from "./stories/AlertStory";
import { IssueStory } from "./stories/IssueStory";
import { PaymentStory } from "./stories/PaymentStory";

interface Props { n: Notification | null; onClose: () => void; onRead: (n: Notification) => void }

/** "View Details": the whole story behind a notification, in a ~620 px glass modal. */
export function StoryModal({ n, onClose, onRead }: Props) {
  return <Modal open={!!n} onClose={onClose} labelledBy="nc-story-title" maxWidth="max-w-[620px]">{n && <Body n={n} onClose={onClose} onRead={onRead} />}</Modal>;
}

/** Where "Open" leads for stories that have no special screen of their own. */
const WHERE: Record<string, string> = { overdue: "/home-owner/rent", tenancy: "/home-owner/tenants" };

function Body({ n, onClose, onRead }: { n: Notification; onClose: () => void; onRead: (n: Notification) => void }) {
  const t = useTranslations("owner.notifications.story");
  const describe = useDescribe();
  const ref = storyRef(n);
  if (ref?.kind === "payment") return <PaymentStory paymentId={ref.id} />;
  if (ref?.kind === "issue") return <IssueStory requestId={ref.id} />;
  if (ref?.kind === "alert") return <AlertStory alertId={ref.id} onAccepted={() => { onRead(n); }} />;

  // overdue rent, a tenant moving in and everything else: the message itself, and a way to the right page
  const d = describe(n);
  const href = WHERE[kindOf(n)] ?? (n.link && n.link.startsWith("/home-owner/") ? n.link : null);
  return (
    <div className="space-y-4 pt-1">
      <h2 id="nc-story-title" className="pr-10 text-xl font-bold text-navy">{d.headline}</h2>
      {d.body && <p className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{d.body}</p>}
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="btn btn-white h-11 px-6 text-sm">{t("close")}</button>
        {href && <Link href={href as never} onClick={onClose} className="btn btn-primary h-11 px-6 text-sm">{t("open")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></Link>}
      </div>
    </div>
  );
}
