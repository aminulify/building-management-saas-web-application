"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { formatDuration, waveBars } from "./logic";

let playing: HTMLAudioElement | null = null; // only one voice note plays at a time

interface Props { url: string | null; durationSec: number; seed: string; mine: boolean }

/** Voice note: play / pause, a wave that fills as it plays (click to jump), and the length. */
export function VoicePlayer({ url, durationSec, seed, mine }: Props) {
  const t = useTranslations("chat.voice");
  const el = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState(false);
  const bars = waveBars(seed);

  useEffect(() => () => { if (playing === el.current) playing = null; el.current?.pause(); }, []);

  async function toggle() {
    if (!url) return;
    if (!el.current) {
      const a = new Audio(url);
      a.onended = () => { setOn(false); setPos(0); };
      a.ontimeupdate = () => setPos(Math.min(1, a.currentTime / Math.max(1, durationSec)));
      a.onpause = () => setOn(false); a.onplay = () => setOn(true);
      a.onerror = () => { setFailed(true); setOn(false); };
      el.current = a;
    }
    const a = el.current;
    if (a.paused) { if (playing && playing !== a) playing.pause(); playing = a; try { await a.play(); } catch { setFailed(true); } } else a.pause();
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    if (!el.current || !url) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    el.current.currentTime = f * durationSec; setPos(f);
  }

  return (
    <div className="flex w-[15rem] max-w-full items-center gap-3 py-1">
      <button type="button" onClick={() => void toggle()} disabled={!url || failed} aria-label={on ? t("pause") : t("play")} aria-pressed={on}
        className={clsx("grid size-10 shrink-0 place-items-center rounded-full transition-transform duration-300 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50", mine ? "bg-white text-[#0A84F0] focus-visible:outline-white" : "bg-[#0A84F0] text-white focus-visible:outline-[#0A84F0]")}>
        {on ? <Pause className="size-4" aria-hidden fill="currentColor" /> : <Play className="size-4 translate-x-px" aria-hidden fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div role="progressbar" aria-label={t("progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)} onClick={seek} className="flex h-8 cursor-pointer items-center gap-[2px]">
          {bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} className={clsx("w-[3px] rounded-full transition-colors duration-200", i / bars.length < pos ? (mine ? "bg-white" : "bg-[#0A84F0]") : (mine ? "bg-white/45" : "bg-slate-300"))} />)}
        </div>
        <p className={clsx("text-[0.68rem] tabular-nums", mine ? "text-white/85" : "text-slate-500")}>{failed ? t("failed") : formatDuration(on || pos > 0 ? pos * durationSec : durationSec)}</p>
      </div>
    </div>
  );
}
