"use client";

import { useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { clsx } from "clsx";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/feedback/Toast";
import { ApiError } from "@/lib/api-client";
import { authApi } from "@/lib/auth-client";
import { CallOverlay } from "./CallOverlay";
import { ConversationList } from "./ConversationList";
import { NewChatModal } from "./NewChatModal";
import { Thread } from "./Thread";
import { otherOf } from "./logic";
import { useCall } from "./use-call";
import { useContacts } from "./use-contacts";
import { useConversations } from "./use-conversations";
import { useLiveEvents } from "./use-live";
import { useThread } from "./use-thread";
import type { Contact, LiveEvent } from "./types";

/**
 * Message page: chats on the left, the open conversation on the right (one at a time on phones). New messages, read
 * ticks, online dots and calls arrive live; who may write to whom is decided by the server.
 */
export function MessagesView({ meId, role }: { meId: string; role: string }) {
  const t = useTranslations("chat");
  const toast = useToast();
  const reduce = useReducedMotion();
  const params = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(params.get("c"));
  const [query, setQuery] = useState("");
  const [newChat, setNewChat] = useState(false);
  const [opening, setOpening] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const convs = useConversations(meId, activeId);
  const thread = useThread(activeId, meId, convs.clearUnread);
  const call = useCall();
  const live = useLiveEvents(useCallback((e: LiveEvent) => { convs.onEvent(e); thread.onEvent(e); call.onEvent(e); }, [convs.onEvent, thread.onEvent, call.onEvent])); // eslint-disable-line react-hooks/exhaustive-deps
  const active = convs.items.find((c) => c.id === activeId) ?? null;

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  useEffect(() => { if (call.problem) { toast("error", t(`call.problem.${call.problem}` as never)); call.clearProblem(); } }, [call.problem]); // eslint-disable-line react-hooks/exhaustive-deps

  // people without a chat yet who match what was typed
  const admin = role === "SUPER_ADMIN" || role === "GOV_ADMIN";
  const contacts = useContacts(query, query.trim().length >= (admin ? 2 : 1));
  const known = new Set(convs.items.flatMap((c) => c.participants.map((p) => p.id)));
  const people = contacts.items.filter((c) => !known.has(c.id));

  const select = (id: string) => { setActiveId(id); convs.clearUnread(id); };
  async function openWith(c: Contact) {
    setOpening(true);
    try {
      const conv = await authApi<{ id: string }>("/conversations", { method: "POST", body: { type: "DIRECT", recipientId: c.id } });
      await convs.reload(true);
      setNewChat(false); setQuery(""); select(conv.id);
    } catch (e) {
      toast("error", t(e instanceof ApiError && e.code === "FORBIDDEN" ? "new.forbidden" : "new.failed"));
    } finally { setOpening(false); }
  }

  const peer = active ? otherOf(active) : null;
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 -z-10 h-64 w-64 rounded-full bg-[#F413E6]/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -left-16 bottom-10 -z-10 h-72 w-72 rounded-full bg-[#48BDFA]/15 blur-3xl motion-safe:animate-[pulse_11s_ease-in-out_infinite]" />
      <h1 className="sr-only">{t("title")}</h1>

      {live === "offline" && (
        <p role="status" className="mb-2 flex items-center justify-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"><WifiOff className="size-4" aria-hidden />{t("live.offline")}</p>
      )}
      <motion.div initial={{ opacity: 0, y: reduce ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card flex h-[calc(100dvh-6.25rem)] min-h-[30rem] overflow-hidden !rounded-3xl p-0 md:h-[calc(100dvh-7.75rem)] md:min-h-[30rem]">
        <ConversationList className={clsx("w-full md:w-[35%] md:max-w-[26rem] md:flex", activeId ? "hidden" : "flex")}
          items={convs.items} state={convs.state} query={query} onQuery={setQuery} activeId={activeId} meId={meId} now={now}
          onSelect={select} onRetry={() => void convs.reload()} onNew={() => setNewChat(true)} people={people} onPerson={(c) => void openWith(c)} />
        <Thread className={clsx("min-w-0 flex-1 md:flex", activeId ? "flex" : "hidden")} conversation={active} thread={thread} meId={meId} now={now}
          canCall={!!active && active.type !== "SUPPORT" && !!peer && call.phase === "idle"} onBack={() => setActiveId(null)}
          onCall={() => { if (peer) void call.start(active!.id, { id: peer.id, fullName: peer.fullName, avatarUrl: peer.avatarUrl }); }} />
      </motion.div>

      <NewChatModal open={newChat} role={role} busy={opening} onClose={() => setNewChat(false)} onPick={(c) => void openWith(c)} />
      <CallOverlay call={call} />
    </div>
  );
}
