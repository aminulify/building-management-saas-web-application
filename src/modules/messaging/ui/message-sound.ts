"use client";

/**
 * The "new message" sound: a short two-note chime made with the browser's own audio (no sound file).
 * Browsers only allow sound after the person has touched the page once, so the first click, key or tap unlocks it;
 * until then a new message is silent (the red alert still shows).
 */
let ctx: AudioContext | null = null;
let unlocked = false;

function context() {
  if (ctx) return ctx;
  try { ctx = new AudioContext(); } catch { ctx = null; }
  return ctx;
}

/** Call once (the provider does): the first interaction makes sound possible. */
export function unlockMessageSound() {
  if (typeof window === "undefined" || unlocked) return () => undefined;
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  const on = () => { const c = context(); void c?.resume().catch(() => undefined); unlocked = true; events.forEach((e) => window.removeEventListener(e, on, true)); };
  events.forEach((e) => window.addEventListener(e, on, { capture: true, passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, on, true));
}

/** Plays the chime now. Returns false when the browser still blocks sound. */
export function playMessageSound(): boolean {
  const c = context();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  if (c.state !== "running") return false;
  const t0 = c.currentTime;
  [[784, 0], [1047, 0.13]].forEach(([f, d]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = f!;
    g.gain.setValueAtTime(0, t0 + d!); g.gain.linearRampToValueAtTime(0.14, t0 + d! + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + d! + 0.32);
    o.connect(g).connect(c.destination); o.start(t0 + d!); o.stop(t0 + d! + 0.34);
  });
  return true;
}
