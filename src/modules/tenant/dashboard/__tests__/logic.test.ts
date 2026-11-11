import { describe, expect, it } from "vitest";
import { activityStatus, firstName, incidentFormSchema, payButton, payFormSchema, phoneHref, photoProblem, repairFormSchema, repairStep, showPhone, sosAddress, sosFormSchema, sosStep } from "../logic";

describe("names and phone numbers", () => {
  it("greeting uses the first name", () => { expect(firstName("Rahim Uddin")).toBe("Rahim"); expect(firstName("  Nasrin ")).toBe("Nasrin"); expect(firstName("")).toBe(""); });
  it("tel: link is built for Bangladesh numbers only", () => {
    expect(phoneHref("01712345678")).toBe("tel:+8801712345678");
    expect(phoneHref("+8801712345678")).toBe("tel:+8801712345678");
    expect(phoneHref("+880 1712-345678")).toBe("tel:+8801712345678");
    expect(phoneHref("12345")).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });
  it("shown like +880 1712-345678", () => { expect(showPhone("01712345678")).toBe("+880 1712-345678"); expect(showPhone(null)).toBe("—"); });
});

describe("SOS address", () => {
  it("property, unit and the written address", () => { expect(sosAddress("Shanti Nibash", "102", "South Keraniganj, Dhaka - 1311")).toBe("Shanti Nibash, Unit - 102, South Keraniganj, Dhaka - 1311"); });
  it("skips an empty address line", () => { expect(sosAddress("Shanti Nibash", "102", "")).toBe("Shanti Nibash, Unit - 102"); });
});

describe("Send Paid Request button", () => {
  const base = { recordId: "r1", month: "2026-12", amount: "25000.00", dueDate: "2026-12-10", state: "DUE" as const, lastPaidAt: null, lastPaidAmount: null, pending: null, payTo: "01711000000" };
  it("send / pending verification / not billed yet", () => {
    expect(payButton(base)).toBe("send");
    expect(payButton({ ...base, pending: { id: "p", amount: "25000.00", method: "BKASH", sentAt: "2026-12-01" } })).toBe("pending");
    expect(payButton({ ...base, recordId: null, state: "UPCOMING" })).toBe("notBilled");
  });
});

describe("recent activity rows", () => {
  it("rent payment: verified is Completed (green), waiting is Pending verification (yellow)", () => {
    expect(activityStatus({ kind: "payment", status: "VERIFIED" })).toEqual({ key: "completed", tone: "green" });
    expect(activityStatus({ kind: "payment", status: "PENDING" })).toEqual({ key: "pendingVerification", tone: "yellow" });
    expect(activityStatus({ kind: "payment", status: "REJECTED" }).tone).toBe("red");
  });
  it("repair: In Progress is blue, Completed green, new ones yellow", () => {
    expect(activityStatus({ kind: "repair", status: "IN_PROGRESS" })).toEqual({ key: "inProgress", tone: "blue" });
    expect(activityStatus({ kind: "repair", status: "COMPLETED" }).tone).toBe("green");
    expect(activityStatus({ kind: "repair", status: "PENDING" }).tone).toBe("yellow");
    expect(activityStatus({ kind: "repair", status: "APPROVED" }).key).toBe("pending");
    expect(activityStatus({ kind: "repair", status: "CANCELLED" }).tone).toBe("gray");
  });
  it("incident and emergency", () => {
    expect(activityStatus({ kind: "incident", status: "OPEN" }).tone).toBe("yellow");
    expect(activityStatus({ kind: "incident", status: "RESOLVED" }).tone).toBe("green");
    expect(activityStatus({ kind: "sos", status: "NEED_ACTION" }).tone).toBe("red");
    expect(activityStatus({ kind: "sos", status: "SOLVED" }).tone).toBe("green");
  });
});

describe("status lines", () => {
  it("repair: Pending → In Progress → Completed", () => {
    expect([repairStep("PENDING"), repairStep("APPROVED"), repairStep("IN_PROGRESS"), repairStep("COMPLETED")]).toEqual([0, 0, 1, 2]);
    expect(repairStep("REJECTED")).toBeNull();
    expect(repairStep("CANCELLED")).toBeNull();
  });
  it("emergency: received → seen → forwarded → solved", () => {
    expect([sosStep("RECEIVED_BY_PLATFORM"), sosStep("SEEN_BY_GOV"), sosStep("FORWARDED"), sosStep("SOLVED")]).toEqual([0, 1, 2, 3]);
  });
});

describe("forms", () => {
  it("payment: a method and a transaction id of letters and digits", () => {
    expect(payFormSchema.safeParse({ method: "BKASH", reference: "9H7A5K2LM" }).success).toBe(true);
    expect(payFormSchema.safeParse({ method: "BKASH", reference: "ab" }).error?.issues[0]?.message).toBe("trxShort");
    expect(payFormSchema.safeParse({ method: "BKASH", reference: "ab cd ef" }).error?.issues[0]?.message).toBe("trxChars");
    expect(payFormSchema.safeParse({ method: "CASH", reference: "ABCD1234" }).success).toBe(false);
  });
  it("repair request: title and description lengths", () => {
    const ok = { category: "PLUMBING", priority: "HIGH", title: "Kitchen sink", description: "Water leaks under it." } as const;
    expect(repairFormSchema.safeParse(ok).success).toBe(true);
    expect(repairFormSchema.safeParse({ ...ok, title: "ab" }).error?.issues[0]?.message).toBe("titleShort");
    expect(repairFormSchema.safeParse({ ...ok, description: "no" }).error?.issues[0]?.message).toBe("descShort");
    expect(repairFormSchema.safeParse({ ...ok, category: "MAGIC" }).success).toBe(false);
  });
  it("incident report needs a real description", () => {
    const ok = { category: "NOISE", subject: "Loud music", description: "Every night after midnight." } as const;
    expect(incidentFormSchema.safeParse(ok).success).toBe(true);
    expect(incidentFormSchema.safeParse({ ...ok, description: "loud" }).error?.issues[0]?.message).toBe("incidentDescShort");
  });
  it("emergency form: a Bangladesh phone, a short description", () => {
    expect(sosFormSchema.safeParse({ contactPhone: "01712345678", description: "" }).success).toBe(true);
    expect(sosFormSchema.safeParse({ contactPhone: "123", description: "" }).error?.issues[0]?.message).toBe("phoneFormat");
    expect(sosFormSchema.safeParse({ contactPhone: "01712345678", description: "x".repeat(501) }).success).toBe(false);
  });
  it("photos: type and size", () => {
    expect(photoProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(photoProblem({ type: "application/pdf", size: 1000 })).toBe("type");
    expect(photoProblem({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("size");
  });
});
