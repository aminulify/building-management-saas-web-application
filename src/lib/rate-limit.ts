import { AppError } from "./errors";

const hits = new Map<string, number[]>();

/**
 * In-memory sliding window. Fine for a single instance; swap for Redis (architecture 2) before scaling out.
 * Throws RATE_LIMITED when `max` hits are reached inside `windowMs`.
 */
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    throw new AppError("RATE_LIMITED", { retryAfterMs: windowMs - (now - recent[0]!) });
  }
  recent.push(now);
  hits.set(key, recent);
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
