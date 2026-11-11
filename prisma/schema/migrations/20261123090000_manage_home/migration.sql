-- Super Admin "Manage Home": deleted listings move to Previous Properties (archive), listings know their unit and building, faster queue queries
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;
-- a listing may point to a building / unit that no longer exists: clear such links before the foreign keys are added
UPDATE "Listing" SET "propertyId" = NULL WHERE "propertyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Property" p WHERE p.id = "Listing"."propertyId");
UPDATE "Listing" SET "unitId" = NULL WHERE "unitId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Unit" u WHERE u.id = "Listing"."unitId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Listing_type_status_id_idx" ON "Listing"("type", "status", "id" DESC);
CREATE INDEX IF NOT EXISTS "ListingReport_listingId_status_idx" ON "ListingReport"("listingId", "status");
