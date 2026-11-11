"use client";

import { AlertCircle, Check, CheckCheck, Clock, Phone, PhoneMissed, RotateCw } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { PersonAvatar } from "./PersonAvatar";
import { VoicePlayer } from "./VoicePlayer";
import { formatDuration, isRead } from "./logic";
import type { CallAtt, ChatMessage, Person, VoiceAtt } from "./types";

interface Props { m: ChatMessage; mine: boolean; sender: Person | null; showAvatar: boolean; readUpTo: string | null; meId: string; onRetry: (clientId: string) => void }

/** One message: white bubble with the sender's picture (theirs), blue bubble with ✓✓ (mine), voice note, or a call line. */
export function MessageBubble({ m, mine, sender, showAvatar, readUpTo, meId, onRetry }: Props) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const time = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date(m.createdAt));
  const call = m.attachments.find((a): a is CallAtt => a.kind === "call");
  const voice = m.attachments.find((a): a is VoiceAtt => a.kind === "voice");

  if (call) {
    const outgoing = call.callerId === meId;
    const label = call.status === "ENDED" ? t("callLog.done", { d: formatDuration(call.durationSec) }) : call.status === "REJECTED" ? t(outgoing ? "callLog.declinedOut" : "callLog.declinedIn") : t(outgoing ? "callLog.noAnswer" : "callLog.missed");
    const bad = call.status !== "ENDED";
    return (
      <li className="flex justify-center py-1">
        <span className={clsx("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur", bad ? "border-red-200 bg-red-50/80 text-red-600" : "border-white/80 bg-white/70 text-slate-600")}>
          {bad ? <PhoneMissed className="size-3.5" aria-hidden /> : <Phone className="size-3.5" aria-hidden />}{label}<span className="font-normal text-slate-400">· {time}</span>
        </span>
      </li>
    );
  }

  return (
    <motion.li initial={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={clsx("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine && (showAvatar ? <PersonAvatar name={sender?.fullName ?? "?"} url={sender?.avatarUrl} size="size-7 text-[0.62rem]" /> : <span className="size-7 shrink-0" aria-hidden />)}
      <div className={clsx("max-w-[82%] rounded-2xl px-3.5 py-2 shadow-[0_6px_18px_-12px_rgba(15,23,42,0.35)] sm:max-w-[70%]", mine ? "rounded-br-md bg-gradient-to-br from-[#1F8FFF] to-[#0A6FE0] text-white" : "rounded-bl-md bg-white text-navy", m.local === "failed" && "ring-2 ring-red-300")}>
        {voice && <VoicePlayer url={voice.url} durationSec={voice.durationSec} seed={m.clientId || m.id} mine={mine} />}
        {m.body && <p className="whitespace-pre-wrap break-words text-[0.92rem] leading-snug">{m.body}</p>}
        <p className={clsx("mt-1 flex items-center justify-end gap-1 text-[0.62rem]", mine ? "text-white/85" : "text-slate-400")}>
          <time dateTime={m.createdAt}>{time}</time>
          {mine && (m.local === "sending" ? <Clock className="size-3" aria-label={t("bubble.sending")} /> : m.local === "failed" ? <AlertCircle className="size-3 text-red-200" aria-label={t("bubble.failed")} /> :
            isRead(m, readUpTo) ? <CheckCheck className="size-3.5 text-cyan-200" aria-label={t("bubble.read")} /> : <Check className="size-3.5" aria-label={t("bubble.sent")} />)}
        </p>
        {m.local === "failed" && <button type="button" onClick={() => onRetry(m.clientId)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-white underline underline-offset-2"><RotateCw className="size-3" aria-hidden />{t("bubble.retry")}</button>}
      </div>
    </motion.li>
  );
}
