export type BoostState = "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED" | "CANCELLED";

/** Fee, length and the bKash number to pay (GET /boosts/settings). */
export interface BoostSettings {
  enabled: boolean;
  fee: string;
  durationDays: number;
  payment: { method: "BKASH_SEND_MONEY"; number: string | null; reference: string };
}

export interface MyBoost {
  id: string; listingId: string; amount: string; durationDays: number; state: BoostState; trxId: string;
  startsAt: string | null; endsAt: string | null; rejectionReason: string | null; createdAt: string; paymentStatus: string | null;
  listing: { title: string };
}

export interface ListingBoostInfo { state: BoostState; endsAt: string | null; reason: string | null }
