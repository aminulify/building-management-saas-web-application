/**
 * The red alert is on while a message the person has not been alerted about is waiting:
 * messages are waiting (count > 0) and the newest came after the last time they clicked the Message button.
 */
export function alertOn(count: number, latestMs: number, ackMs: number): boolean {
  return count > 0 && latestMs > ackMs;
}

export const ackKey = (userId: string) => `ag:msg-ack:${userId}`;

export function readAck(userId: string): number {
  try { const v = Number(window.localStorage.getItem(ackKey(userId))); return Number.isFinite(v) ? v : 0; } catch { return 0; }
}
export function writeAck(userId: string, ms: number) {
  try { window.localStorage.setItem(ackKey(userId), String(ms)); } catch { /* private mode: the alert just comes back next time */ }
}
