/**
 * Notification audit: every notification text must show real data, never "{title}" or "{name}".
 *   npm run audit:notifications
 * 1. every message under `notifications.*` is formatted in English and Bangla with sample values: no braces may be left and every
 *    placeholder must have been replaced (this catches the ICU rule that `'{title}'` prints the braces: use “{title}” instead)
 * 2. every notify() call in the code is read: the params it sends must cover the placeholders of the message it uses
 * 3. every notification stored in the database is formatted with its own params
 */
import fs from "node:fs";
import path from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { createTranslator } from "use-intl";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const messages = { en: JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")), bn: JSON.parse(fs.readFileSync(path.join(root, "messages/bn.json"), "utf8")) } as const;
let problems = 0;
const bad = (msg: string) => { problems += 1; console.log("  PROBLEM " + msg); };

/** names of the arguments a message needs (nested plural / select branches included) */
function argsOf(els: MessageFormatElement[], out = new Set<string>()): Set<string> {
  for (const e of els) {
    if (e.type === TYPE.argument || e.type === TYPE.number || e.type === TYPE.date || e.type === TYPE.time) out.add(e.value);
    else if (e.type === TYPE.plural || e.type === TYPE.select) { out.add(e.value); for (const o of Object.values(e.options)) argsOf(o.value, out); }
    else if (e.type === TYPE.tag) argsOf(e.children, out);
  }
  return out;
}

function checkMessages() {
  console.log("1) every notification message, English and Bangla");
  for (const locale of ["en", "bn"] as const) {
    const ns = messages[locale].notifications as Record<string, unknown>;
    const t = createTranslator({ locale, messages: messages[locale], namespace: "notifications", onError: () => undefined });
    for (const [key, raw] of Object.entries(ns)) {
      if (typeof raw !== "string") continue;
      const args = [...argsOf(parse(raw))];
      const sample = Object.fromEntries(args.map((a) => [a, a === "status" || a === "action" ? "PENDING" : a === "count" || a === "n" || a === "days" ? 3 : `«${a}»`]));
      let out = "";
      try { out = t(key as never, sample as never); } catch (e) { bad(`${locale} ${key}: cannot be formatted (${(e as Error).message})`); continue; }
      if (/[{}]/.test(out)) bad(`${locale} ${key}: braces are left in the text: ${out}`);
      for (const a of args) if (!["status", "action", "count", "n", "days"].includes(a) && !out.includes(`«${a}»`)) bad(`${locale} ${key}: {${a}} is not replaced: ${out}`);
    }
  }
}

function walk(dir: string, out: string[] = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!["node_modules", ".next", "__tests__"].includes(f.name)) walk(p, out); } else if (/\.tsx?$/.test(f.name)) out.push(p);
  }
  return out;
}

function checkCallSites() {
  console.log("2) every place that creates a notification sends what its text needs");
  const en = messages.en.notifications as Record<string, string>;
  let calls = 0, viaVariable = 0;
  for (const file of walk(path.join(root, "src"))) {
    const text = fs.readFileSync(file, "utf8");
    const re = /titleKey:\s*(["'`])notifications\.([\w$\{\}\[\]\.\s?:"'()]+?)\1/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const key = m[2]!;
      if (key.includes("${")) continue; // built from a status word: each possible key is checked in part 1
      calls += 1;
      const msg = en[key];
      if (typeof msg !== "string") { bad(`${path.relative(root, file)}: no message "notifications.${key}"`); continue; }
      const need = [...argsOf(parse(msg))];
      const tail = text.slice(m.index, m.index + 400);
      if (/params:\s*[A-Za-z_]\w*\s*[,}]/.test(tail) || /[{,]\s*params\s*[,}]/.test(tail)) { viaVariable += 1; continue; } // params come from a variable: their real shape is checked in part 3
      const pm = /params:\s*\{([^}]*)\}/.exec(tail);
      const sent = new Set(pm ? [...pm[1]!.matchAll(/(?:^|[,\s])(\w+)\s*(?::|,|$)/g)].map((x) => x[1]!) : []);
      const missing = need.filter((a) => !sent.has(a));
      if (missing.length) bad(`${path.relative(root, file)}: "${key}" needs {${missing.join("}, {")}} but the call sends ${pm ? "{" + [...sent].join(", ") + "}" : "no params"}`);
    }
  }
  console.log(`   ${calls} notify() calls read (${viaVariable} send their params from a variable)`);
}

async function checkDatabase() {
  console.log("3) every stored notification");
  const db = new PrismaClient();
  try {
    const rows = await db.notification.findMany({ select: { type: true, titleKey: true, params: true }, take: 5000, orderBy: { id: "desc" } });
    const seen = new Set<string>();
    let n = 0;
    for (const locale of ["en", "bn"] as const) {
      const t = createTranslator({ locale, messages: messages[locale], onError: () => undefined });
      for (const r of rows) {
        const id = `${locale}|${r.titleKey}|${Object.keys((r.params ?? {}) as object).sort().join(",")}`;
        if (seen.has(id)) continue;
        seen.add(id); n += 1;
        if (!(messages[locale] as Record<string, unknown>) || typeof getPath(messages[locale], r.titleKey) !== "string") { bad(`${locale} stored "${r.titleKey}" (${r.type}) has no message`); continue; }
        const need = [...argsOf(parse(getPath(messages[locale], r.titleKey) as string))];
        const have = new Set(Object.keys((r.params ?? {}) as object));
        const missing = need.filter((a) => !have.has(a));
        let out = "";
        try { out = t(r.titleKey as never, (r.params ?? {}) as never); } catch { out = "{error}"; }
        if (missing.length || /[{}]/.test(out)) bad(`${locale} stored "${r.titleKey}" (${r.type}): ${missing.length ? `missing {${missing.join("}, {")}}` : ""} ${/[{}]/.test(out) ? "text: " + out : ""}`);
      }
    }
    console.log(`   ${n} different stored shapes checked`);
  } finally { await db.$disconnect(); }
}
const getPath = (o: unknown, p: string) => p.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);

async function main() {
  checkMessages();
  checkCallSites();
  await checkDatabase();
  console.log(problems ? `\n${problems} problem(s) found` : "\nAll notification texts render with real data.");
  process.exitCode = problems ? 1 : 0;
}
main();
