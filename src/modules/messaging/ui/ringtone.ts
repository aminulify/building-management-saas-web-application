"use client";

/** A soft two-tone ring made with the browser's own audio (no sound files). `stop()` ends it. Silent if audio is blocked. */
export function startRing(kind: "incoming" | "outgoing"): () => void {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    ctx = new AudioContext();
    const beep = () => {
      if (!ctx) return;
      const freqs = kind === "incoming" ? [880, 660] : [425];
      freqs.forEach((f, i) => {
        const o = ctx!.createOscillator(); const g = ctx!.createGain();
        const t0 = ctx!.currentTime + i * 0.28;
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.08, t0 + 0.04); g.gain.linearRampToValueAtTime(0, t0 + 0.24);
        o.connect(g).connect(ctx!.destination); o.start(t0); o.stop(t0 + 0.26);
      });
    };
    void ctx.resume().then(beep).catch(() => undefined);
    timer = setInterval(beep, kind === "incoming" ? 2200 : 3000);
  } catch { /* no audio available */ }
  return () => { clearInterval(timer); void ctx?.close().catch(() => undefined); ctx = null; };
}
