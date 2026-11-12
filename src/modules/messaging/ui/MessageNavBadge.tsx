"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useMessaging } from "./MessagingProvider";

/** The pulsing red dot on the Message button. It stays until the person clicks the button. */
export function MessageNavBadge({ compact }: { compact?: boolean }) {
  const t = useTranslations("chat.alert");
  const m = useMessaging();
  if (!m?.alert.on) return null;
  return (
    <span className={clsx("grid shrink-0 place-items-center", compact ? "absolute right-2.5 top-2" : "ml-auto")} role="status">
      <span className="relative grid size-5 place-items-center">
        <span aria-hidden className="absolute inline-flex size-full rounded-full bg-red-500/70 motion-safe:animate-ping" />
        <span className="relative grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[0.65rem] font-extrabold leading-5 text-white shadow-[0_0_0_2px_rgba(255,255,255,0.9)]" aria-hidden>{m.alert.count > 9 ? "9+" : m.alert.count}</span>
      </span>
      <span className="sr-only">{t("label", { count: m.alert.count })}</span>
    </span>
  );
}

/** Click handler for the Message button's link. */
export function useAcknowledge() {
  const m = useMessaging();
  return () => m?.alert.acknowledge();
}
