import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/require-actor";
import { bdPhoneSchema } from "@/modules/users/schema";

const json = z.record(z.string(), z.unknown());

/** Closed list of editable keys. `secret` values are masked on read and never written to the audit log. */
const SETTINGS = {
  "platform.name": { schema: z.string().min(2).max(60), secret: false },
  "platform.logo": { schema: z.string().max(300), secret: false },
  "platform.defaultLanguage": { schema: z.enum(["bn", "en"]), secret: false },
  "platform.languages": { schema: z.array(z.enum(["bn", "en"])).min(1), secret: false },
  "platform.currency": { schema: z.enum(["BDT"]), secret: false },
  "platform.timezone": { schema: z.enum(["Asia/Dhaka"]), secret: false },
  "payment.bkash.personalNumber": { schema: bdPhoneSchema, secret: false },
  "billing.graceDays": { schema: z.number().int().min(0).max(14), secret: false },
  "notifications.defaults": { schema: json, secret: false },
  "sos.onDutyPhones": { schema: z.array(bdPhoneSchema).max(20), secret: false },
  "marketplace.nearbyRangeM": { schema: z.number().int().min(100).max(10000), secret: false },
  "marketplace.requireOwnershipDocs": { schema: z.boolean(), secret: false },
  "email.provider": { schema: json, secret: true },
  "payment.gateway": { schema: json, secret: true },
  "emergency.integration": { schema: json, secret: true },
} as const;
type Key = keyof typeof SETTINGS;

export const settingsPatchSchema = z.record(z.string(), z.unknown()).refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

const MASK = "••••••••";

export async function getSettings() {
  const rows = await db.platformSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.isSecret ? MASK : r.value]));
}

/** Typed read with default, used by the billing and marketplace modules. */
export async function getSetting<T>(key: Key, fallback: T): Promise<T> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  return (row?.value as T | undefined) ?? fallback;
}

export async function patchSettings(actor: Actor, body: Record<string, unknown>, req: Request) {
  const errors: { path: string; code: string }[] = [];
  const parsed: [Key, unknown][] = [];
  for (const [k, v] of Object.entries(body)) {
    const def = SETTINGS[k as Key];
    if (!def) { errors.push({ path: k, code: "unknown_setting" }); continue; }
    if (def.secret && v === MASK) continue; // client echoed the mask back: keep the stored value
    const r = def.schema.safeParse(v);
    if (!r.success) errors.push({ path: k, code: "invalid_value" });
    else parsed.push([k as Key, r.data]);
  }
  if (errors.length) throw new AppError("VALIDATION_ERROR", errors);

  await db.$transaction(async (tx) => {
    for (const [k, v] of parsed) {
      const secret = SETTINGS[k].secret;
      await tx.platformSetting.upsert({ where: { key: k }, update: { value: v as object, isSecret: secret }, create: { key: k, value: v as object, isSecret: secret } });
    }
    await writeAudit({ actor, action: "settings.update", resourceType: "PlatformSetting", after: { keys: parsed.map(([k]) => k) }, req }, tx);
  });
  return getSettings();
}

/** Connectivity checks are wired when the providers are configured (module: notifications / phase 2 gateway). */
export async function testProvider(kind: "email" | "payment") {
  const row = await db.platformSetting.findUnique({ where: { key: kind === "email" ? "email.provider" : "payment.gateway" } });
  return { configured: !!row, ok: false, message: row ? "provider adapter not installed yet" : "not configured" };
}
