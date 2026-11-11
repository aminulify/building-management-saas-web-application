import { requireActor } from "@/lib/auth/require-actor";
import { route } from "@/lib/api/handler";
import { subscribe } from "@/modules/messaging/hub";
import { goOffline, goOnline, heartbeat } from "@/modules/messaging/presence.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 20_000;

/**
 * Live events for the signed-in user as a Server-Sent Events stream: new messages, read marks, who is online and
 * incoming calls. The browser reads it with fetch (EventSource cannot send the Authorization header).
 */
export const GET = route(async (req) => {
  const actor = await requireActor(req);
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => { try { controller.enqueue(enc.encode(chunk)); } catch { /* stream already closed */ } };
      const unsub = subscribe(actor.id, (e) => send(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
      const timer = setInterval(() => { send(": ping\n\n"); void heartbeat(actor).catch(() => undefined); }, PING_MS);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsub();
        void goOffline(actor).catch(() => undefined);
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", cleanup);
      send("retry: 3000\n\n");
      void goOnline(actor).then(() => send("event: ready\ndata: {}\n\n")).catch(() => send("event: ready\ndata: {}\n\n"));
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
});
