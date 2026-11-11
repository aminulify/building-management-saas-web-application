"use client";

import { Mic, Phone } from "lucide-react";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "../../owner/dashboard/format";
import { PersonAvatar } from "./PersonAvatar";
import { otherOf, stampKind } from "./logic";
import type { Conversation } from "./types";

interface Props { c: Conversation; selected: boolean; meId: string; now: number; onSelect: (id: string) => void }

/** Clock today, "Yesterday", otherwise "Dec 02". */
export function useStamp() {
  const t = useTranslations("chat");
  const locale = useLocale();
  return (iso: string, now: number) => {
    const k = stampKind(iso, now);
    const d = new Date(iso);
    if (k === "time") return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Dhaka" }).format(d);
    if (k === "yesterday") return t("stamp.yesterday");
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { month: "short", day: "2-digit", timeZone: "Asia/Dhaka" }).format(d);
  };
}

/** One conversation: picture with online dot, name, property and unit, last message, time and unread badge. */
export function ConversationRow({ c, selected, meId, now, onSelect }: Props) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const stamp = useStamp();
  const p = otherOf(c);
  const name = p?.fullName ?? t("support.title");
  const last = c.lastMessage;
  const sub = p?.unit && p.property ? t("list.unitLine", { property: p.property, unit: p.unit }) : p ? t(`roles.${p.role}` as never) : t("support.subtitle");
  const preview = !last ? t("list.noMessages")
    : last.kind === "voice" ? t("preview.voice")
    : last.kind === "call" ? t("preview.call")
    : last.body;

  return (
    <li>
      <button type="button" onClick={() => onSelect(c.id)} aria-current={selected ? "true" : undefined}
        className={clsx("group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#48BDFA]", selected ? "bg-sky-50/90" : "hover:bg-white/70")}>
        <PersonAvatar name={name} url={p?.avatarUrl} online={p ? p.online : undefined} size="size-12" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={clsx("truncate text-[0.95rem] text-navy", c.unread ? "font-extrabold" : "font-bold")}>{name}</span>
            {last && <time dateTime={last.createdAt} className="shrink-0 text-[0.68rem] text-slate-500">{stamp(last.createdAt, now)}</time>}
          </span>
          <span className="block truncate text-[0.72rem] text-slate-500">{sub}</span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className={clsx("flex min-w-0 items-center gap-1 truncate text-[0.74rem]", c.unread ? "font-semibold text-navy" : "text-slate-500")}>
              {last?.kind === "voice" && <Mic className="size-3 shrink-0" aria-hidden />}
              {last?.kind === "call" && <Phone className="size-3 shrink-0" aria-hidden />}
              <span className="truncate">{last && last.senderId === meId && last.kind === "text" ? `${t("preview.you")} ` : ""}{preview}</span>
            </span>
            {c.unread > 0 && (
              <span role="status" aria-label={t("list.unread", { n: c.unread })} className="grid h-[1.15rem] min-w-[1.15rem] shrink-0 place-items-center rounded-full bg-[#0A84F0] px-1 text-[0.65rem] font-bold text-white">
                {formatNumber(locale)(c.unread)}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
