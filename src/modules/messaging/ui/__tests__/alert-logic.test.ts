import { describe, expect, it } from "vitest";
import { ackKey, alertOn } from "../alert-logic";

describe("the red alert on the Message button", () => {
  it("is on while a message waits that came after the last click", () => {
    expect(alertOn(1, 2000, 1000)).toBe(true);
    expect(alertOn(5, 2000, 0)).toBe(true);
  });
  it("is off after the click, until a newer message comes", () => {
    expect(alertOn(3, 2000, 2000)).toBe(false);
    expect(alertOn(3, 2000, 5000)).toBe(false);
    expect(alertOn(4, 6000, 5000)).toBe(true);
  });
  it("is off when nothing waits", () => {
    expect(alertOn(0, 2000, 0)).toBe(false);
  });
  it("is remembered per person", () => {
    expect(ackKey("abc")).toBe("ag:msg-ack:abc");
    expect(ackKey("abc")).not.toBe(ackKey("def"));
  });
});
