-- Previous Tenants: reason for leaving, owner rating, private notes, "removed from history"
CREATE TYPE "LeaveReason" AS ENUM ('JOB_TRANSFER', 'PURCHASED_HOME', 'UPGRADED_UNIT', 'LEASE_EXPIRED', 'OTHER');
CREATE TYPE "TenantBehavior" AS ENUM ('EXCELLENT', 'GOOD', 'AVERAGE', 'UGLY', 'BAD', 'VERY_BAD');
ALTER TABLE "RentalAgreement" ADD COLUMN "leaveReason" "LeaveReason", ADD COLUMN "behavior" "TenantBehavior", ADD COLUMN "ownerNotes" TEXT, ADD COLUMN "historyHiddenAt" TIMESTAMPTZ;
CREATE INDEX "RentalAgreement_ownerId_status_endDate_idx" ON "RentalAgreement"("ownerId", "status", "endDate");
