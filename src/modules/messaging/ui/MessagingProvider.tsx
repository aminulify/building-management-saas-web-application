"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { CallOverlay } from "./CallOverlay";
import { playMessageSound, unlockMessageSound } from "./message-sound";
import { useCall } from "./use-call";
import { useLiveEvents, type LiveState } from "./use-live";
import { useMessageAlert } from "./use-message-alert";
import type { LiveEvent } from "./types";

interface Messaging {
  meId: string;
  live: LiveState;
  call: ReturnType<typeof useCall>;
  alert: ReturnType<typeof useMessageAlert>;
  /** the Message page listens to the same live connection */
  subscribe: (fn: (e: LiveEvent) => void) => () => void;
}

const Ctx = createContext<Messaging | null>(null);
export const useMessaging = () => useContext(Ctx);

/**
 * Lives in every signed-in area (owner, tenant, Tenant Free, Super Admin). One live connection for the whole visit, so that
 *  - a new message plays a sound at once, on any page, and switches on the red alert of the Message button;
 *  - a call rings on any page (not only on the Message page) and the call screen opens over whatever is open.
 */
export function MessagingProvider({ meId, children }: { meId: string; children: React.ReactNode }) {
  const t = useTranslations("chat");
  const toast = useToast();
  const call = useCall();
  const alert = useMessageAlert(meId);
  const listeners = useRef(new Set<(e: LiveEvent) => void>());

  useEffect(() => unlockMessageSound(), []);

  const onEvent = useCallback((e: LiveEvent) => {
    call.onEvent(e);
    if (e.type === "message:new" && e.data.message.senderId !== meId) {
      if (call.phase === "idle") playMessageSound();
      alert.incoming(e.data.message.createdAt);
    }
    if (e.type === "ready") alert.refresh();
    listeners.current.forEach((fn) => fn(e));
  }, [call.onEvent, call.phase, alert.incoming, alert.refresh, meId]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = useLiveEvents(onEvent);
  const subscribe = useCallback((fn: (e: LiveEvent) => void) => { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; }, []);

  useEffect(() => { if (call.problem) { toast("error", t(`call.problem.${call.problem}` as never)); call.clearProblem(); } }, [call.problem]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ meId, live, call, alert, subscribe }), [meId, live, call, alert, subscribe]);
  return <Ctx.Provider value={value}>{children}<CallOverlay call={call} /></Ctx.Provider>;
}
