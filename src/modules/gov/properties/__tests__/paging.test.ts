import { describe, expect, it } from "vitest";
import { FIRST_PAGE, STEP, buttonFor, lessVisible, moreVisible } from "../paging";

describe("Government All Properties: View More / View Less", () => {
  it("starts with 9 rows and moves in blocks of 10", () => {
    expect(FIRST_PAGE).toBe(9);
    expect(STEP).toBe(10);
    expect(moreVisible(9, 19)).toBe(19);
    expect(moreVisible(19, 29)).toBe(29);
  });
  it("never shows more rows than are loaded, nor fewer than the first 9", () => {
    expect(moreVisible(19, 24)).toBe(24);
    expect(lessVisible(24)).toBe(14);
    expect(lessVisible(14)).toBe(9);
    expect(lessVisible(9)).toBe(9);
  });
  it("the button is View More until the end is on screen, then View Less down to 9 rows", () => {
    expect(buttonFor(9, 9, false, "more")).toBeNull();      // a short list has no button
    expect(buttonFor(9, 9, true, "more")).toBe("more");     // more rows exist on the server
    expect(buttonFor(9, 19, false, "more")).toBe("more");   // loaded but hidden
    expect(buttonFor(24, 24, false, "less")).toBe("less");
    expect(buttonFor(14, 24, false, "less")).toBe("less");
    expect(buttonFor(9, 24, false, "less")).toBeNull();     // back at the start the mode flips to "more"
  });
});
