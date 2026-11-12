import { describe, expect, it } from "vitest";
import { tenantLookupQuery } from "../schema";

describe("tenant lookup keys", () => {
  it("exactly one of phone, e-mail or Tenant ID", () => {
    expect(tenantLookupQuery.safeParse({ phone: "01711111111" }).success).toBe(true);
    expect(tenantLookupQuery.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(tenantLookupQuery.safeParse({ tenantCode: "tf100015" }).success).toBe(true);
    expect(tenantLookupQuery.parse({ tenantCode: "tf100015" }).tenantCode).toBe("TF100015");
    expect(tenantLookupQuery.safeParse({}).success).toBe(false);
    expect(tenantLookupQuery.safeParse({ phone: "01711111111", email: "a@b.com" }).success).toBe(false);
    expect(tenantLookupQuery.safeParse({ phone: "01711111111", tenantCode: "TF100015" }).success).toBe(false);
  });
  it("a Tenant ID has two letters and digits", () => {
    for (const bad of ["T1", "TF", "100015", "TF1000A5", "TF 100015"]) expect(tenantLookupQuery.safeParse({ tenantCode: bad }).success).toBe(false);
  });
});
