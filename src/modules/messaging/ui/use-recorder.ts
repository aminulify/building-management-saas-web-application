"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_SEC, voiceMime } from "./logic";
import type { Voice } from "./use-thread";

export type RecorderError = "denied" | "unsupported" | "failed" | null;
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
const BARS = 36;

/**
 * Voice note recorder. `levels` is the live wave (0..1, newest last), `seconds` the timer.
 * `stop()` resolves with the recording, `cancel()` throws it away. Stops by itself at five minutes.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<RecorderError>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; wave?: ReturnType<typeof setInterval>; ctx?: AudioContext }>({});
  const done = useRef<((v: Voice | null) => void) | null>(null);

  const release = useCallback(() => {
    clearInterval(timers.current.tick); clearInterval(timers.current.wave);
    void timers.current.ctx?.close().catch(() => undefined);
    timers.current = {};
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setRecording(false); setSeconds(0); setLevels(Array(BARS).fill(0));
  }, []);

  const finish = useCallback((keep: boolean) => {
    const r = rec.current;
    if (!r || r.state === "inactive") { release(); done.current?.(null); return; }
    r.onstop = () => {
      const durationSec = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      const mime = voiceMime(r.mimeType || chunks.current[0]?.type || "");
      const blob = new Blob(chunks.current, { type: mime ?? "audio/webm" });
      release();
      done.current?.(keep && mime && blob.size > 0 ? { blob, mime, durationSec: Math.min(durationSec, VOICE_MAX_SEC) } : null);
      done.current = null;
    };
    r.stop();
  }, [release]);

  const start = useCallback(async () => {
    if (rec.current && rec.current.state !== "inactive") return;
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) { setError("unsupported"); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.current = r;
      r.start(250);
      started.current = Date.now();
      setRecording(true);
      timers.current.tick = setInterval(() => {
        const sec = Math.round((Date.now() - started.current) / 1000);
        setSeconds(sec);
        if (sec >= VOICE_MAX_SEC) finish(true);
      }, 250);
      try {
        const ctx = new AudioContext();
        const an = ctx.createAnalyser(); an.fftSize = 256;
        ctx.createMediaStreamSource(s).connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        timers.current.ctx = ctx;
        timers.current.wave = setInterval(() => {
          an.getByteTimeDomainData(data);
          let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          setLevels((cur) => [...cur.slice(1), Math.min(1, peak / 90)]);
        }, 80);
      } catch { /* no wave without an analyser; recording still works */ }
    } catch (e) {
      release();
      setError((e as DOMException).name === "NotAllowedError" || (e as DOMException).name === "SecurityError" ? "denied" : "failed");
    }
  }, [finish, release]);

  const stop = useCallback(() => new Promise<Voice | null>((resolve) => { done.current = resolve; finish(true); }), [finish]);
  const cancel = useCallback(() => { done.current = null; finish(false); }, [finish]);
  useEffect(() => () => { done.current = null; try { rec.current?.state !== "inactive" && rec.current?.stop(); } catch { /* gone */ } release(); }, [release]);

  return { recording, seconds, levels, error, start, stop, cancel, clearError: () => setError(null) };
}
