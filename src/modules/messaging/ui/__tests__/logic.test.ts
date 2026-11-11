import { describe, expect, it } from "vitest";
import { applyIncoming, dividerKind, formatDuration, groupByDay, initials, isRead, matchesQuery, stampKind, upsertMessage, voiceMime, waveBars } from "../logic";
import type { ChatMessage, Conversation } from "../types";

const person = (over = {}) => ({ id: "u2", fullName: "Rahim Uddin", username: "rahim", role: "TENANT", avatarUrl: null, online: true, lastSeenAt: null, unit: "102", property: "Shanti Nibesh", ...over });
const conv = (over: Partial<Conversation> = {}): Conversation => ({ id: "c1", type: "DIRECT", listingId: null, pinned: false, unread: 0, lastMessage: null, participants: [person()], ...over });
const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({ id: "m1", conversationId: "c1", senderId: "u2", clientId: "k1", body: "hi", createdAt: "2026-11-10T10:00:00.000Z", attachments: [], ...over });

describe("search chats", () => {
  it("finds by tenant name, username, unit and property, in any letter case", () => {
    expect(matchesQuery(conv(), "rahim")).toBe(true);
    expect(matchesQuery(conv(), "UDDIN")).toBe(true);
    expect(matchesQuery(conv(), "102")).toBe(true);
    expect(matchesQuery(conv(), "shanti")).toBe(true);
    expect(matchesQuery(conv(), "nusrat")).toBe(false);
  });
  it("an empty search shows everyone", () => { expect(matchesQuery(conv(), "  ")).toBe(true); });
  it("a chat without a person never matches a word", () => { expect(matchesQuery(conv({ participants: [] }), "x")).toBe(false); });
});

describe("small helpers", () => {
  it("initials", () => { expect(initials("Rahim Uddin")).toBe("RU"); expect(initials("Halim")).toBe("H"); expect(initials("")).toBe("?"); });
  it("duration as m:ss", () => { expect(formatDuration(35)).toBe("0:35"); expect(formatDuration(125)).toBe("2:05"); expect(formatDuration(-3)).toBe("0:00"); });
  it("voice types: codec text is ignored, other types refused", () => {
    expect(voiceMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(voiceMime("audio/mp4")).toBe("audio/mp4");
    expect(voiceMime("video/webm")).toBeNull();
  });
  it("the same message always draws the same wave", () => { expect(waveBars("a")).toEqual(waveBars("a")); expect(waveBars("a")).not.toEqual(waveBars("b")); expect(waveBars("a", 10)).toHaveLength(10); });
});

describe("list times and day pills", () => {
  const now = new Date(2026, 10, 10, 15, 0).getTime();
  it("today shows the clock, then Yesterday, then a date", () => {
    expect(stampKind(new Date(2026, 10, 10, 9, 0).toISOString(), now)).toBe("time");
    expect(stampKind(new Date(2026, 10, 9, 23, 0).toISOString(), now)).toBe("yesterday");
    expect(stampKind(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toBe("date");
    expect(dividerKind(new Date(2026, 10, 10, 1, 0).toISOString(), now)).toBe("today");
  });
  it("messages are split by calendar day", () => {
    const g = groupByDay([msg({ id: "a", createdAt: new Date(2026, 10, 9, 10).toISOString() }), msg({ id: "b", createdAt: new Date(2026, 10, 9, 11).toISOString() }), msg({ id: "c", createdAt: new Date(2026, 10, 10, 9).toISOString() })]);
    expect(g.map((x) => x.items.length)).toEqual([2, 1]);
  });
});

describe("live updates", () => {
  it("a saved message replaces our own copy that was still sending", () => {
    const mine = msg({ id: "tmp", senderId: "me", clientId: "k9", local: "sending" });
    const out = upsertMessage([mine], msg({ id: "real", senderId: "me", clientId: "k9" }));
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("real");
    expect(out[0]!.local).toBeUndefined();
  });
  it("the same message arriving twice is kept once, and order follows time", () => {
    const a = msg({ id: "a", createdAt: "2026-11-10T10:00:00.000Z" }), b = msg({ id: "b", clientId: "k2", createdAt: "2026-11-10T11:00:00.000Z" });
    expect(upsertMessage(upsertMessage([b], a), a).map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("an incoming message goes to the top, with its preview and an unread number", () => {
    const list = [conv({ id: "c0", participants: [person({ id: "x" })] }), conv()];
    const out = applyIncoming(list, msg({ attachments: [{ kind: "voice", url: null, mime: "audio/webm", size: 1, durationSec: 5 }] }), "me", null);
    expect(out[0]!.id).toBe("c1");
    expect(out[0]!.unread).toBe(1);
    expect(out[0]!.lastMessage?.kind).toBe("voice");
  });
  it("no unread for the open chat or for my own messages; unknown chats are left alone", () => {
    expect(applyIncoming([conv()], msg(), "me", "c1")[0]!.unread).toBe(0);
    expect(applyIncoming([conv()], msg({ senderId: "me" }), "me", null)[0]!.unread).toBe(0);
    const list = [conv()];
    expect(applyIncoming(list, msg({ conversationId: "zzz" }), "me", null)).toBe(list);
  });
  it("double tick is blue only up to the last message the other person read", () => {
    expect(isRead(msg({ id: "0005" }), "0007")).toBe(true);
    expect(isRead(msg({ id: "0009" }), "0007")).toBe(false);
    expect(isRead(msg({ id: "0001", local: "sending" }), "0007")).toBe(false);
    expect(isRead(msg(), null)).toBe(false);
  });
});
