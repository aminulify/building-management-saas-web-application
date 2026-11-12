import { createTranslator } from "use-intl";
import { describe, expect, it } from "vitest";
import bn from "../../../../messages/bn.json";
import en from "../../../../messages/en.json";
import { detailRows, groupOf, humanize, shortRef } from "../details";

describe("notification details window", () => {
  it("lists only the known facts, in a fixed order, without blanks or ids", () => {
    const rows = detailRows({ requestId: "0192f2c4", unit: "A101", title: "Leaking tap", property: "Shanti Nibash", reason: "  ", amount: 25000, nothing: null });
    expect(rows.map((r) => r.key)).toEqual(["title", "property", "unit", "amount"]);
    expect(rows.find((r) => r.key === "amount")?.value).toBe(25000);
  });
  it("copes with no params at all", () => {
    expect(detailRows(null)).toEqual([]);
    expect(detailRows({})).toEqual([]);
  });
  it("groups a notification by the first word of its type", () => {
    expect(groupOf("rent.invoice")).toBe("rent");
    expect(groupOf("sos.new")).toBe("sos");
    expect(groupOf("listing.moderated")).toBe("listing");
    expect(groupOf("boost.approved")).toBe("boost");
    expect(groupOf("something.else")).toBe("other");
  });
  it("makes stored words readable and a short reference", () => {
    expect(humanize("IN_PROGRESS")).toBe("In progress");
    expect(humanize("approve")).toBe("Approve");
    expect(shortRef("0192f2c4-1b7e-7a3c-8d11-5d6f0a0c1111")).toBe("0A0C1111");
  });
  it("every group and every fact the window can show has a label in English and Bangla", () => {
    for (const m of [en, bn]) {
      const d = m.notificationDetails as { groups: Record<string, string>; fields: Record<string, string> };
      for (const g of ["rent", "payment", "maintenance", "sos", "tenancy", "listing", "boost", "property", "upgrade", "complaint", "account", "message", "billing", "other"]) expect(d.groups[g], g).toBeTruthy();
      for (const f of ["title", "subject", "name", "tenantName", "tenant", "reporter", "user", "from", "property", "unit", "alertType", "type", "plan", "days", "month", "amount", "total", "paid", "due", "balance", "fee", "receipt", "status", "action", "reason", "notes"]) expect(d.fields[f], f).toBeTruthy();
    }
  });
});

/**
 * ICU MessageFormat: an apostrophe in front of a placeholder ('{title}') turns the braces into plain text, so the person sees
 * "{title}" instead of the real title. Use curly quotes (“{title}”) around placeholders.
 */
describe("messages show real data, never raw placeholders", () => {
  const strings = (o: unknown, path = ""): [string, string][] =>
    typeof o === "string" ? [[path, o]] : o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k)) : [];

  for (const [name, m] of [["en", en], ["bn", bn]] as const) {
    it(`${name}: no message has an apostrophe right before a placeholder`, () => {
      const bad = strings(m).filter(([, v]) => /'\{/.test(v)).map(([k]) => k);
      expect(bad).toEqual([]);
    });
    it(`${name}: every notification text replaces all of its placeholders`, () => {
      const t = createTranslator({ locale: name, messages: m as never, namespace: "notifications" as never, onError: () => undefined });
      const problems: string[] = [];
      for (const [key, raw] of Object.entries(m.notifications as Record<string, unknown>)) {
        if (typeof raw !== "string") continue;
        const args = [...raw.matchAll(/\{(\w+)(?:,|\})/g)].map((x) => x[1]!);
        const sample = Object.fromEntries(args.map((a) => [a, a === "status" || a === "action" ? "PENDING" : a === "days" || a === "n" || a === "count" ? 3 : `«${a}»`]));
        const out = t(key as never, sample as never);
        if (/[{}]/.test(out)) problems.push(`${key}: ${out}`);
      }
      expect(problems).toEqual([]);
    });
  }
});
