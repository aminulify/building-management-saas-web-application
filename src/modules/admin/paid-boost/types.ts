export type BoostTab = "all" | "active" | "expired" | "failed";
export type BoostState = "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED" | "CANCELLED";

export interface BoostRow {
  id: string; amount: string; durationDays: number; senderNumber: string; trxId: string;
  status: string; state: BoostState; paymentStatus: string | null;
  startsAt: string | null; endsAt: string | null; reviewedAt: string | null; rejectionReason: string | null; createdAt: string;
  user: { id: string; fullName: string; phone: string | null; email: string | null; ownerCode: string | null };
  listing: { id: string; title: string; type: "RENT" | "SALE"; price: string; status: string; location: string; thumbnailUrl: string | null };
}
export interface BoostPage { items: BoostRow[]; nextCursor: string | null; total: number }
export interface BoostStats { pending: number; active: number; expired: number; rejected: number; failed: number; total: number; revenue: string; paidCount: number }
export interface BoostSettings { enabled: boolean; fee: string; durationDays: number }
