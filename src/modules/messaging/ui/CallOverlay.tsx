"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { PersonAvatar } from "./PersonAvatar";
import { formatDuration } from "./logic";
import type { useCall } from "./use-call";

type Call = ReturnType<typeof useCall>;

/** Full-screen voice call: picture with a pulsing ring, "Ringing…" → "Connected" with a timer, mute, speaker and end. */
export function CallOverlay({ call }: { call: Call }) {
  const t = useTranslations("chat.call");
  const reduce = useReducedMotion();
  const first = useRef<HTMLButtonElement>(null);
  const open = call.phase !== "idle" && !!call.peer;
  const { phase } = call;

  useEffect(() => { if (open) first.current?.focus(); }, [open, phase === "incoming"]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = phase === "calling" ? t("ringing") : phase === "incoming" ? t("incoming") : phase === "connecting" ? t("connecting") : phase === "connected" ? formatDuration(call.seconds)
    : phase === "unreachable" ? t("unreachable") : phase === "ended" ? (call.problem === "dropped" ? t("problem.dropped") : t("ended")) : "";
  const live = phase === "calling" || phase === "incoming" || phase === "connecting" || phase === "connected";

  return (
    <AnimatePresence>
      {open && call.peer && (
        <motion.div key="call" role="dialog" aria-modal="true" aria-labelledby="call-name" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/70 p-4 backdrop-blur-md">
          <motion.div initial={{ opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/30 bg-gradient-to-b from-[#1b2a52]/95 via-[#27306a]/95 to-[#3b2370]/95 px-6 pb-8 pt-10 text-center text-white shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)]">
            <div aria-hidden className="pointer-events-none absolute -left-10 -top-10 size-48 rounded-full bg-[#F413E6]/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-12 -right-10 size-52 rounded-full bg-[#48BDFA]/25 blur-3xl" />
            <div className="relative mx-auto grid size-32 place-items-center">
              {(phase === "calling" || phase === "incoming") && !reduce && [0, 1].map((i) => (
                <motion.span key={i} aria-hidden className="absolute inset-0 rounded-full border border-white/50" initial={{ scale: 0.8, opacity: 0.7 }} animate={{ scale: 1.55, opacity: 0 }} transition={{ duration: 2.2, repeat: Infinity, delay: i * 1.1, ease: "easeOut" }} />
              ))}
              {phase === "connected" && <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-emerald-400/70" />}
              <PersonAvatar name={call.peer.fullName} url={call.peer.avatarUrl} size="size-28 text-3xl" />
            </div>
            <h2 id="call-name" className="relative mt-5 text-xl font-bold">{call.peer.fullName}</h2>
            <p role="status" aria-live="polite" className={clsx("relative mt-1 text-sm tabular-nums", phase === "connected" ? "font-semibold text-emerald-300" : "text-white/80", phase === "unreachable" && "text-amber-200")}>{status}</p>

            <div className="relative mt-9 flex items-center justify-center gap-5">
              {phase === "incoming" ? (
                <>
                  <CallButton refEl={first} label={t("decline")} tone="red" onClick={call.hangup}><PhoneOff className="size-6" aria-hidden /></CallButton>
                  <CallButton label={t("accept")} tone="green" onClick={() => void call.accept()} pulse={!reduce}><Phone className="size-6" aria-hidden /></CallButton>
                </>
              ) : (
                <>
                  <CallButton label={call.muted ? t("unmute") : t("mute")} tone="glass" active={call.muted} onClick={call.toggleMute} disabled={!live}>{call.muted ? <MicOff className="size-6" aria-hidden /> : <Mic className="size-6" aria-hidden />}</CallButton>
                  <CallButton refEl={first} label={t("end")} tone="red" onClick={call.hangup} disabled={!live}><PhoneOff className="size-6" aria-hidden /></CallButton>
                  <CallButton label={call.speaker ? t("speakerOff") : t("speakerOn")} tone="glass" active={!call.speaker} onClick={call.toggleSpeaker} disabled={!live}>{call.speaker ? <Volume2 className="size-6" aria-hidden /> : <VolumeX className="size-6" aria-hidden />}</CallButton>
                </>
              )}
            </div>
            <div className="relative mt-3 flex justify-center gap-5 text-[0.7rem] text-white/70">
              {phase === "incoming" ? (<><span className="w-16">{t("decline")}</span><span className="w-16">{t("accept")}</span></>) : (<><span className="w-16">{call.muted ? t("unmute") : t("mute")}</span><span className="w-16">{t("end")}</span><span className="w-16">{t("speaker")}</span></>)}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CallButton({ children, label, tone, onClick, active, disabled, pulse, refEl }: { children: React.ReactNode; label: string; tone: "red" | "green" | "glass"; onClick: () => void; active?: boolean; disabled?: boolean; pulse?: boolean; refEl?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={refEl} type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={tone === "glass" ? !!active : undefined}
      className={clsx("grid size-16 place-items-center rounded-full text-white shadow-lg transition-all duration-300 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40",
        tone === "red" && "bg-red-500 hover:bg-red-600", tone === "green" && "bg-emerald-500 hover:bg-emerald-600", pulse && "motion-safe:animate-pulse",
        tone === "glass" && (active ? "bg-white text-navy" : "border border-white/30 bg-white/15 backdrop-blur"))}>
      {children}
    </button>
  );
}
