-- Previous Owners page: Banned / Inactive / Deleted log actions, the day an account left and a reason code for the filter
ALTER TYPE "AccountAction" ADD VALUE IF NOT EXISTS 'BANNED';
ALTER TYPE "AccountAction" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "AccountAction" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "User" ADD COLUMN "archiveReasonCode" TEXT;
ALTER TABLE "User" ADD COLUMN "leftAt" TIMESTAMPTZ;

UPDATE "User" SET "leftAt" = COALESCE("archivedAt", "updatedAt"), "archiveReasonCode" = 'OTHER'
WHERE "role" = 'OWNER' AND ("archivedAt" IS NOT NULL OR "status" IN ('BANNED', 'INACTIVE', 'DELETED'));

CREATE INDEX "User_role_leftAt_idx" ON "User"("role", "leftAt");
