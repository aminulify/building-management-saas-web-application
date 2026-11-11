/**
 * In-process push hub: one open event stream per browser tab. `publish` hands an event to every stream of the given
 * users at once. Single server instance only; for several instances the same two functions move to Redis pub/sub
 * (architecture section 8) without touching callers.
 */
export type HubEvent = { type: string; data: unknown };
type Listener = (e: HubEvent) => void;

const g = globalThis as unknown as { __agHub?: Map<string, Set<Listener>> };
const streams = (g.__agHub ??= new Map());

export function subscribe(userId: string, fn: Listener): () => void {
  let set = streams.get(userId);
  if (!set) streams.set(userId, (set = new Set()));
  set.add(fn);
  return () => { set.delete(fn); if (set.size === 0) streams.delete(userId); };
}

export function publish(userIds: Iterable<string>, event: HubEvent): void {
  for (const id of new Set(userIds)) for (const fn of streams.get(id) ?? []) { try { fn(event); } catch { /* a broken stream must not stop the others */ } }
}

export const isConnected = (userId: string) => (streams.get(userId)?.size ?? 0) > 0;
