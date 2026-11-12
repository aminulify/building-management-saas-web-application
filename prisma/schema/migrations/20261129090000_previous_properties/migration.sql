-- Previous Properties page: a DELETED state, the day a property left service and a reason code for the filter
ALTER TYPE "PropertyStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "Property" ADD COLUMN "archiveReasonCode" TEXT;
ALTER TABLE "Property" ADD COLUMN "deactivatedAt" TIMESTAMPTZ;

-- existing records: the day they were archived (or last changed) and the nearest reason
UPDATE "Property" SET "deactivatedAt" = COALESCE("archivedAt", "updatedAt") WHERE "archivedAt" IS NOT NULL OR "status" IN ('SUSPENDED', 'INACTIVE', 'ARCHIVED');
UPDATE "Property" SET "archiveReasonCode" = 'OTHER' WHERE "deactivatedAt" IS NOT NULL;

CREATE INDEX "Property_status_deactivatedAt_idx" ON "Property"("status", "deactivatedAt");
