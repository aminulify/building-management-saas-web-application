-- Paid Boost: the seller pays a fixed fee (bKash), the Super Admin verifies, the listing is featured for a while
CREATE TYPE "BoostStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "Listing" ADD COLUMN "boostEndsAt" TIMESTAMPTZ;
ALTER TABLE "PaymentTransaction" ADD COLUMN "boostId" UUID;

CREATE TABLE "ListingBoost" (
  "id" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "senderNumber" TEXT NOT NULL,
  "trxId" TEXT NOT NULL,
  "status" "BoostStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId" UUID,
  "reviewedAt" TIMESTAMPTZ,
  "rejectionReason" TEXT,
  "startsAt" TIMESTAMPTZ,
  "endsAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingBoost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingBoost_trxId_key" ON "ListingBoost"("trxId");
CREATE INDEX "ListingBoost_status_createdAt_idx" ON "ListingBoost"("status", "createdAt" DESC);
CREATE INDEX "ListingBoost_listingId_status_idx" ON "ListingBoost"("listingId", "status");
CREATE INDEX "ListingBoost_userId_createdAt_idx" ON "ListingBoost"("userId", "createdAt" DESC);
CREATE INDEX "ListingBoost_status_endsAt_idx" ON "ListingBoost"("status", "endsAt");
-- a listing can have only one boost waiting for review at a time
CREATE UNIQUE INDEX "ListingBoost_one_pending_per_listing" ON "ListingBoost"("listingId") WHERE "status" = 'PENDING';
CREATE INDEX "Listing_boostEndsAt_idx" ON "Listing"("boostEndsAt") WHERE "boostEndsAt" IS NOT NULL;
CREATE INDEX "PaymentTransaction_boostId_idx" ON "PaymentTransaction"("boostId");

ALTER TABLE "ListingBoost" ADD CONSTRAINT "ListingBoost_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ListingBoost" ADD CONSTRAINT "ListingBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_boostId_fkey" FOREIGN KEY ("boostId") REFERENCES "ListingBoost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
