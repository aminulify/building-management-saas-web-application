/**
 * Everybody who talks to the Super Admin sees the same sender: "AmaderGhor Support Center" with the AmaderGhor icon,
 * never the personal name of the admin account. Used in chats, call screens and notifications.
 */
export const SUPPORT_NAME = "AmaderGhor Support Center";
/** The same icon the browser tab shows (src/app/[locale]/layout.tsx). */
export const SUPPORT_AVATAR = "/images/logo-icon.png";

export const isStaffSender = (role: string | null | undefined) => role === "SUPER_ADMIN";

/** The name other people see for this account. */
export const shownName = (u: { role?: string | null; fullName: string }) => (isStaffSender(u.role) ? SUPPORT_NAME : u.fullName);

/** The picture other people see for this account (`avatarUrl` is the already signed link of the personal photo). */
export const shownAvatar = (u: { role?: string | null }, avatarUrl: string | null) => (isStaffSender(u.role) ? SUPPORT_AVATAR : avatarUrl);
