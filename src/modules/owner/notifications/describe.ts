"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatTaka } from "../dashboard/format";
import { kindOf, monthLabel, str } from "./logic";
import type { Kind, Notification } from "./types";

/**
 * The headline and message of a notification, in the viewer's language. Every known kind names the tenant, the unit and
 * the property; any other type falls back to its own text from the shared `notifications` messages.
 */
export function useDescribe() {
  const t = useTranslations("owner.notifications");
  const root = useTranslations();
  const locale = useLocale();
  const taka = formatTaka(locale);
  return (n: Notification): { kind: Kind; headline: string; body: string } => {
    const kind = kindOf(n);
    const p = n.params;
    const typeKey = str(p.type ?? p.alertType);
    const vars = {
      tenant: str(p.tenantName ?? p.reporter), unit: str(p.unit), property: str(p.property), amount: taka(Number(str(p.amount) || 0)), due: taka(Number(str(p.due) || 0)),
      receipt: str(p.receipt), title: str(p.title), alert: typeKey ? t(`sosTypes.${typeKey}` as never) : "", month: monthLabel(locale, str(p.month)),
    };
    if (kind === "generic") return { kind, headline: root(n.titleKey as never, p as never), body: "" };
    return { kind, headline: t(`kinds.${kind}.title` as never, vars as never), body: t(`kinds.${kind}.body` as never, vars as never) };
  };
}
