/**
 * Finds translation keys used in code that are missing from messages/en.json or messages/bn.json.
 *   node scripts/check-messages.mjs src/modules/find-home src/modules/market
 * Static keys t("a.b") are checked; template keys t(`a.${x}`) are checked by trying the prefix only.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dirs = process.argv.slice(2);
const langs = { en: JSON.parse(readFileSync("messages/en.json", "utf8")), bn: JSON.parse(readFileSync("messages/bn.json", "utf8")) };
const get = (o, path) => path.split(".").reduce((a, k) => (a && typeof a === "object" ? a[k] : undefined), o);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === "__tests__" ? [] : walk(p)) : /\.tsx?$/.test(n) ? [p] : []; });

let bad = 0;
for (const dir of dirs) for (const file of walk(dir)) {
  const src = readFileSync(file, "utf8");
  const ns = {};
  for (const m of src.matchAll(/const (\w+) = useTranslations\("([^"]+)"\)/g)) (ns[m[1]] ??= []).push(m[2]);
  for (const m of src.matchAll(/\b(\w+)(?:\.rich|\.has)?\(\s*(["`])([A-Za-z0-9_.${}\-]+)\2/g)) {
    const [, fn, , key] = m;
    if (!ns[fn] || /^[a-z]{2}-[A-Z]{2}$/.test(key)) continue;
    const dynamic = key.includes("${");
    const sub = dynamic ? key.split("${")[0].replace(/\.$/, "") : key;
    // the same variable name can hold different namespaces in different components of one file: any of them may match
    for (const [lang, msgs] of Object.entries(langs)) {
      const ok = ns[fn].some((n) => { const v = get(msgs, `${n}.${sub}`); return v !== undefined && (!dynamic || typeof v === "object"); });
      if (!ok) { bad++; console.log(`MISSING ${lang}: ${ns[fn].map((n) => n + "." + sub).join(" | ")}  (${file})`); }
    }
  }
}
console.log(bad ? `\n${bad} problem(s)` : "all keys present in en and bn");
process.exit(bad ? 1 : 0);
