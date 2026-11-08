-- Constraints Prisma cannot express. Appended to the initial migration (see prisma/migrations).

-- one ACTIVE agreement per unit
CREATE UNIQUE INDEX "RentalAgreement_one_active_per_unit"
  ON "RentalAgreement" ("unitId") WHERE status = 'ACTIVE';

-- one ACTIVE/GRACE subscription per (user, audience)
CREATE UNIQUE INDEX "UserSubscription_one_live_per_audience"
  ON "UserSubscription" ("userId", "audience") WHERE status IN ('ACTIVE', 'GRACE');

-- one PENDING upgrade request per user
CREATE UNIQUE INDEX "UpgradeRequest_one_pending_per_user"
  ON "UpgradeRequest" ("userId") WHERE status = 'PENDING';

-- one OPEN report per (listing, reporter)
CREATE UNIQUE INDEX "ListingReport_one_open"
  ON "ListingReport" ("listingId", "reporterId") WHERE status = 'OPEN';

-- Owner IDs: OW10001, OW10002, ... never reused
CREATE SEQUENCE IF NOT EXISTS owner_code_seq START 10001;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;

-- PostGIS spatial indexes
CREATE INDEX "Property_location_gix" ON "Property" USING GIST ("location");
CREATE INDEX "Listing_location_gix" ON "Listing" USING GIST ("location");
CREATE INDEX "Facility_location_gix" ON "Facility" USING GIST ("location");

-- AuditLog is append-only. Run as a DB owner after creating the app role (replace app_user):
-- REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM app_user;
-- REVOKE UPDATE, DELETE, TRUNCATE ON "EmergencyAlertEvent" FROM app_user;
