import { describe, expect, it } from "vitest";
import { STRENGTH_KEYS, filled, profileStrength, type StrengthInput } from "../profile-strength";

const all = Object.fromEntries(STRENGTH_KEYS.map((k) => [k, true])) as unknown as StrengthInput;
const none = Object.fromEntries(STRENGTH_KEYS.map((k) => [k, false])) as unknown as StrengthInput;

describe("profile strength", () => {
  it("a complete profile is 100%, an empty one 0%", () => {
    expect(profileStrength(all)).toEqual({ percent: 100, missing: [] });
    expect(profileStrength(none).percent).toBe(0);
    expect(profileStrength(none).missing).toHaveLength(STRENGTH_KEYS.length);
  });
  it("each missing item lowers it and is named", () => {
    const r = profileStrength({ ...all, avatar: false, nidBack: false });
    expect(r.missing).toEqual(["avatar", "nidBack"]);
    expect(r.percent).toBe(Math.round(((STRENGTH_KEYS.length - 2) / STRENGTH_KEYS.length) * 100));
  });
  it("filling more never lowers the number", () => {
    let last = -1;
    const cur = { ...none };
    for (const k of STRENGTH_KEYS) { (cur as Record<string, boolean>)[k] = true; const p = profileStrength(cur).percent; expect(p).toBeGreaterThanOrEqual(last); last = p; }
  });
  it("blank or spaces-only text counts as empty", () => {
    expect(filled("  ")).toBe(false);
    expect(filled(null)).toBe(false);
    expect(filled("Dhamura")).toBe(true);
  });
});
