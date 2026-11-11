"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { startRing } from "./ringtone";
import type { LiveEvent } from "./types";

export type CallPhase = "idle" | "calling" | "unreachable" | "incoming" | "connecting" | "connected" | "ended";
export type CallProblem = "mic" | "busy" | "forbidden" | "network" | "dropped" | null;
export interface CallPeer { id: string; fullName: string; avatarUrl: string | null }

const ICE: RTCConfiguration = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };
const RING_TIMEOUT_MS = 45_000;

/**
 * Live voice call between two people. Audio travels directly browser to browser (WebRTC); our server only sets the call
 * up: it rings the other side and relays the offer / answer / network candidates, and writes the call into the chat.
 */
export function useCall() {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<CallProblem>(null);

  const phaseRef = useRef<CallPhase>("idle");
  const callId = useRef<string | null>(null);
  const caller = useRef(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const queued = useRef<RTCIceCandidateInit[]>([]);
  const ring = useRef<(() => void) | null>(null);
  const timers = useRef<{ clock?: ReturnType<typeof setInterval>; ring?: ReturnType<typeof setTimeout>; idle?: ReturnType<typeof setTimeout> }>({});

  const go = (p: CallPhase) => { phaseRef.current = p; setPhase(p); };
  const signal = (kind: "offer" | "answer" | "ice", payload: unknown) => {
    if (callId.current) void authApi(`/calls/${callId.current}/signal`, { method: "POST", body: { data: { kind, payload } } }).catch(() => undefined);
  };

  const teardown = useCallback(() => {
    ring.current?.(); ring.current = null;
    clearInterval(timers.current.clock); clearTimeout(timers.current.ring);
    pc.current?.close(); pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null;
    if (audio.current) { audio.current.srcObject = null; audio.current = null; }
    queued.current = []; callId.current = null;
    setMuted(false); setSpeaker(true);
  }, []);

  /** Back to the page after a short "call ended" moment. */
  const finishSoon = useCallback((ms = 1500) => {
    teardown();
    go("ended");
    clearTimeout(timers.current.idle);
    timers.current.idle = setTimeout(() => { go("idle"); setPeer(null); setSeconds(0); }, ms);
  }, [teardown]);

  const micStream = async () => {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return null; }
  };

  function connection(stream: MediaStream) {
    const c = new RTCPeerConnection(ICE);
    stream.getTracks().forEach((t) => c.addTrack(t, stream));
    c.onicecandidate = (e) => { if (e.candidate) signal("ice", e.candidate.toJSON()); };
    c.ontrack = (e) => {
      const a = audio.current ?? new Audio();
      a.srcObject = e.streams[0] ?? null; a.autoplay = true;
      audio.current = a; void a.play().catch(() => undefined);
    };
    c.onconnectionstatechange = () => {
      if (c.connectionState === "connected" && phaseRef.current !== "connected") {
        go("connected"); setSeconds(0);
        const t0 = Date.now();
        timers.current.clock = setInterval(() => setSeconds(Math.round((Date.now() - t0) / 1000)), 500);
      }
      if (c.connectionState === "failed") { setProblem("dropped"); void authApi(`/calls/${callId.current}/end`, { method: "POST" }).catch(() => undefined); finishSoon(2500); }
    };
    pc.current = c;
    return c;
  }

  const start = useCallback(async (conversationId: string, to: CallPeer) => {
    if (phaseRef.current !== "idle") return;
    setProblem(null); setPeer(to); go("calling");
    const stream = await micStream();
    if (!stream) { setProblem("mic"); go("idle"); setPeer(null); return; }
    local.current = stream;
    try {
      const r = await authApi<{ id: string; reachable: boolean }>("/calls", { method: "POST", body: { conversationId } });
      callId.current = r.id; caller.current = true;
      if (!r.reachable) { teardown(); go("unreachable"); timers.current.idle = setTimeout(() => { go("idle"); setPeer(null); }, 2800); return; }
      ring.current = startRing("outgoing");
      timers.current.ring = setTimeout(() => { void authApi(`/calls/${r.id}/missed`, { method: "POST" }).catch(() => undefined); }, RING_TIMEOUT_MS);
    } catch (e) {
      teardown(); go("idle"); setPeer(null);
      setProblem(e instanceof ApiError && e.code === "INVALID_STATE" ? "busy" : e instanceof ApiError && e.code === "FORBIDDEN" ? "forbidden" : "network");
    }
  }, [teardown]);

  const accept = useCallback(async () => {
    if (phaseRef.current !== "incoming" || !callId.current) return;
    ring.current?.(); ring.current = null;
    const stream = await micStream();
    if (!stream) { setProblem("mic"); void authApi(`/calls/${callId.current}/reject`, { method: "POST" }).catch(() => undefined); finishSoon(300); return; }
    local.current = stream; connection(stream); go("connecting");
    try { await authApi(`/calls/${callId.current}/accept`, { method: "POST" }); } catch { setProblem("network"); finishSoon(2000); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishSoon]);

  const hangup = useCallback(() => {
    const id = callId.current;
    if (!id) { finishSoon(300); return; }
    const calling = phaseRef.current === "calling" || phaseRef.current === "incoming";
    const action = phaseRef.current === "incoming" ? "reject" : calling ? "missed" : "end";
    void authApi(`/calls/${id}/${action}`, { method: "POST" }).catch(() => undefined);
    finishSoon(action === "end" ? 1200 : 300);
  }, [finishSoon]);

  const toggleMute = useCallback(() => setMuted((m) => { local.current?.getAudioTracks().forEach((t) => { t.enabled = m; }); return !m; }), []);
  const toggleSpeaker = useCallback(() => setSpeaker((s) => { if (audio.current) audio.current.volume = s ? 0.3 : 1; return !s; }), []);

  /** Live events that concern a call. */
  const onEvent = useCallback((e: LiveEvent) => {
    if (e.type === "call:incoming") {
      if (phaseRef.current !== "idle") { void authApi(`/calls/${e.data.callId}/reject`, { method: "POST" }).catch(() => undefined); return; }
      callId.current = e.data.callId; caller.current = false; setProblem(null); setPeer(e.data.caller); go("incoming");
      ring.current = startRing("incoming");
    } else if (e.type === "call:accepted" && e.data.callId === callId.current && caller.current) {
      ring.current?.(); ring.current = null; clearTimeout(timers.current.ring);
      go("connecting");
      const c = connection(local.current!);
      void c.createOffer().then(async (o) => { await c.setLocalDescription(o); signal("offer", o); });
    } else if (e.type === "call:signal" && e.data.callId === callId.current) {
      const c = pc.current;
      const flush = async () => { for (const i of queued.current.splice(0)) await c?.addIceCandidate(i).catch(() => undefined); };
      if (e.data.kind === "offer" && c) {
        void c.setRemoteDescription(e.data.payload as RTCSessionDescriptionInit).then(async () => { await flush(); const a = await c.createAnswer(); await c.setLocalDescription(a); signal("answer", a); });
      } else if (e.data.kind === "answer" && c) void c.setRemoteDescription(e.data.payload as RTCSessionDescriptionInit).then(flush);
      else if (e.data.kind === "ice") {
        if (c?.remoteDescription) void c.addIceCandidate(e.data.payload as RTCIceCandidateInit).catch(() => undefined); else queued.current.push(e.data.payload as RTCIceCandidateInit);
      }
    } else if (e.type === "call:ended" && e.data.callId === callId.current) finishSoon(e.data.durationSec > 0 ? 1500 : 900);
  }, [finishSoon]);

  useEffect(() => () => { teardown(); clearTimeout(timers.current.idle); }, [teardown]);
  return { phase, peer, muted, speaker, seconds, problem, clearProblem: () => setProblem(null), start, accept, hangup, toggleMute, toggleSpeaker, onEvent };
}
