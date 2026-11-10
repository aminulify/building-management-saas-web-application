-- Find Home: duplex/studio categories, place-name columns on listings, balconies, and visit requests
ALTER TYPE "ListingCategory" ADD VALUE IF NOT EXISTS 'DUPLEX';
ALTER TYPE "ListingCategory" ADD VALUE IF NOT EXISTS 'STUDIO';

CREATE TYPE "VisitStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED');

ALTER TABLE "Listing"
  ADD COLUMN "division" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "upazila" TEXT,
  ADD COLUMN "unionName" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "balconies" INTEGER;

CREATE INDEX "Listing_status_type_district_idx" ON "Listing"("status", "type", "district");

CREATE TABLE "VisitRequest" (
  "id" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "requesterId" UUID NOT NULL,
  "sellerId" UUID NOT NULL,
  "scheduledFor" TIMESTAMPTZ NOT NULL,
  "note" TEXT,
  "status" "VisitStatus" NOT NULL DEFAULT 'PENDING',
  "responseNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "VisitRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisitRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "VisitRequest_requesterId_status_idx" ON "VisitRequest"("requesterId", "status");
CREATE INDEX "VisitRequest_sellerId_status_idx" ON "VisitRequest"("sellerId", "status");
CREATE INDEX "VisitRequest_listingId_idx" ON "VisitRequest"("listingId");

-- one live visit request per person and listing
CREATE UNIQUE INDEX "VisitRequest_active_unique" ON "VisitRequest"("listingId", "requesterId") WHERE "status" IN ('PENDING', 'CONFIRMED');
