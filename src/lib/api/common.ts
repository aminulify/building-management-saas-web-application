import { z } from "zod";

export const uuid = z.string().uuid();
export const idParam = (v: string) => uuid.parse(v);

export const pageQuery = z.object({
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** UUID v7 ids are time-sortable, so `id desc` is a stable newest-first cursor order. */
export const pageArgs = (q: z.infer<typeof pageQuery>) => ({
  take: q.limit + 1,
  orderBy: { id: "desc" as const },
  ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
});

export function pageResult<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/** Cron/internal endpoints: shared secret in `x-cron-secret`. */
export const isCronRequest = (req: Request, secret: string) => req.headers.get("x-cron-secret") === secret;

export const dateOnly = z.coerce.date().transform((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
export const money = z.coerce.number().positive().max(100_000_000).multipleOf(0.01);
export const moneyOrZero = z.coerce.number().min(0).max(100_000_000).multipleOf(0.01);
export const coords = { lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) };
