import { describe, expect, it } from "vitest";
import { SUPPORT_AVATAR, SUPPORT_NAME, isStaffSender, shownAvatar, shownName } from "../identity";

describe("how the Super Admin is shown to everyone else", () => {
  it("one name and one icon, whoever the admin is", () => {
    expect(SUPPORT_NAME).toBe("AmaderGhor Support Center");
    expect(SUPPORT_AVATAR).toBe("/images/logo-icon.png");
    expect(shownName({ role: "SUPER_ADMIN", fullName: "amaderghor" })).toBe(SUPPORT_NAME);
    expect(shownAvatar({ role: "SUPER_ADMIN" }, "https://x/photo.png")).toBe(SUPPORT_AVATAR);
    expect(shownAvatar({ role: "SUPER_ADMIN" }, null)).toBe(SUPPORT_AVATAR);
  });
  it("everybody else keeps their own name and photo", () => {
    for (const role of ["OWNER", "TENANT", "GENERAL_USER", "GOV_ADMIN"]) {
      expect(shownName({ role, fullName: "Rahim" })).toBe("Rahim");
      expect(shownAvatar({ role }, "https://x/p.png")).toBe("https://x/p.png");
      expect(isStaffSender(role)).toBe(false);
    }
  });
});
