-- Super Admin Previous Tenants page: three more leave reasons, a rent-clearance ruling, a note and an admin-hidden flag
ALTER TYPE "LeaveReason" ADD VALUE IF NOT EXISTS 'POLICY_VIOLATION';
ALTER TYPE "LeaveReason" ADD VALUE IF NOT EXISTS 'BUSINESS_CLOSED';
ALTER TYPE "LeaveReason" ADD VALUE IF NOT EXISTS 'EVICTED';

ALTER TABLE "RentalAgreement" ADD COLUMN "clearanceStatus" TEXT;
ALTER TABLE "RentalAgreement" ADD COLUMN "adminNote" TEXT;
ALTER TABLE "RentalAgreement" ADD COLUMN "adminHiddenAt" TIMESTAMPTZ;

CREATE INDEX "RentalAgreement_status_adminHiddenAt_idx" ON "RentalAgreement"("status", "adminHiddenAt");
