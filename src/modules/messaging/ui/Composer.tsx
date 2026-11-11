"use client";

import { useRef, useState } from "react";
import { ChevronRight, Mic, Send, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { formatDuration } from "./logic";
import { useRecorder } from "./use-recorder";
import type { Voice } from "./use-thread";

interface Props { disabled?: boolean; onText: (t: string) => void; onVoice: (v: Voice) => void }

/** Message box: text, a microphone for voice notes (click to start, click send to finish) and the Send button. No picture upload. */
export function Composer({ disabled, onText, onVoice }: Props) {
  const t = useTranslations("chat.composer");
  const reduce = useReducedMotion();
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const rec = useRecorder();

  function submit() {
    const v = text.trim();
    if (!v || disabled) return;
    onText(v); setText("");
    input.current?.focus();
  }
  async function sendVoice() {
    const v = await rec.stop();
    if (v) onVoice(v);
  }
  const mic = rec.error === "denied" ? t("micDenied") : rec.error === "unsupported" ? t("micUnsupported") : rec.error === "failed" ? t("micFailed") : null;

  return (
    <div className="border-t border-white/60 bg-white/60 p-3 backdrop-blur-xl sm:p-4">
      {mic && <p role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{mic}<button type="button" onClick={rec.clearError} className="font-bold underline">{t("dismiss")}</button></p>}
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white/80 p-1.5 pl-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus-within:border-[#48BDFA] focus-within:ring-2 focus-within:ring-[#48BDFA]/25">
        <AnimatePresence mode="wait" initial={false}>
          {rec.recording ? (
            <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex min-h-10 min-w-0 flex-1 items-center gap-3" role="status" aria-label={t("recording")}>
              <button type="button" onClick={rec.cancel} aria-label={t("cancelRecording")} className="grid size-9 shrink-0 place-items-center rounded-full text-red-500 transition-colors hover:bg-red-50"><Trash2 className="size-[1.1rem]" aria-hidden /></button>
              <span className="size-2.5 shrink-0 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden />
              <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-navy">{formatDuration(rec.seconds)}</span>
              <span aria-hidden className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden">
                {rec.levels.map((l, i) => <span key={i} style={{ height: `${Math.max(12, Math.round(l * 100))}%`, transition: reduce ? "none" : "height 0.08s linear" }} className="w-[3px] shrink-0 rounded-full bg-[#0A84F0]" />)}
              </span>
            </motion.div>
          ) : (
            <motion.div key="txt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="chat-input">{t("aria")}</label>
              <textarea id="chat-input" ref={input} rows={1} value={text} disabled={disabled} maxLength={2000} placeholder={t("placeholder")}
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                className="block max-h-28 min-h-10 w-full resize-none bg-transparent py-2.5 text-sm text-navy outline-none placeholder:text-slate-400 disabled:opacity-60" />
            </motion.div>
          )}
        </AnimatePresence>
        {!rec.recording && <button type="button" onClick={() => void rec.start()} disabled={disabled} aria-label={t("record")} title={t("record")} className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors duration-300 hover:bg-sky-50 hover:text-[#0A84F0] disabled:opacity-50"><Mic className="size-5" aria-hidden /></button>}
        {rec.recording
          ? <button type="button" onClick={() => void sendVoice()} aria-label={t("sendVoice")} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#0A84F0] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(10,132,240,0.8)] transition-transform duration-300 hover:-translate-y-px"><Send className="size-4" aria-hidden />{t("send")}</button>
          : <button type="button" onClick={submit} disabled={disabled || !text.trim()} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-[#0A84F0] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_-8px_rgba(10,132,240,0.8)] transition-all duration-300 hover:-translate-y-px disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none">{t("send")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></button>}
      </div>
    </div>
  );
}
