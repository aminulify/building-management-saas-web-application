import type { RoleName } from "./roles";

export interface CommParty {
  id: string;
  role: RoleName;
}

export interface CommContext {
  /** Owner id of the sender's/recipient's ACTIVE agreement (tenant ↔ owner link). */
  activeAgreementOwnerId?: string | null;
  /** Owner has an active agreement with the tenant (resolved by caller from DB). */
  hasActiveAgreement?: boolean;
  /** Both are participants of a LISTING_INQUIRY conversation. */
  isListingInquiry?: boolean;
  /** Conversation was opened by an admin, so the other side may reply. */
  isReplyToAdmin?: boolean;
  /** Recipient is the Support channel (Super Admin team). */
  viaSupport?: boolean;
}

/** Pure rule shared by the API and the future realtime service (architecture 4.3). */
export function canCommunicate(sender: CommParty, recipient: CommParty, ctx: CommContext = {}): boolean {
  if (sender.id === recipient.id) return false;
  if (ctx.isReplyToAdmin) return true;

  switch (sender.role) {
    case "SUPER_ADMIN":
      return true;
    case "GOV_ADMIN":
      return ["OWNER", "TENANT", "SUPER_ADMIN", "GOV_ADMIN"].includes(recipient.role);
    case "OWNER":
      if (recipient.role === "SUPER_ADMIN") return !!ctx.viaSupport;
      return recipient.role === "TENANT" && !!ctx.hasActiveAgreement;
    case "TENANT":
      if (recipient.role === "SUPER_ADMIN") return !!ctx.viaSupport;
      return recipient.role === "OWNER" && !!ctx.hasActiveAgreement;
    case "GENERAL_USER":
      if (recipient.role === "SUPER_ADMIN") return !!ctx.viaSupport;
      return !!ctx.isListingInquiry;
    default:
      return false;
  }
}
