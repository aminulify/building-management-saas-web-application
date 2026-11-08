-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "availableFrom" DATE,
ADD COLUMN     "condition" TEXT,
ADD COLUMN     "declaration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fullAddress" TEXT,
ADD COLUMN     "videoUrl" TEXT;

-- AlterTable
ALTER TABLE "ListingReport" ADD COLUMN     "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "refundAmount" DECIMAL(12,2),
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "description" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addressId" UUID,
ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "cancelledAt" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "ScheduledPlanChange" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "effectiveAt" TIMESTAMPTZ NOT NULL,
    "appliedAt" TIMESTAMPTZ,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledPlanChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledPlanChange_appliedAt_effectiveAt_idx" ON "ScheduledPlanChange"("appliedAt", "effectiveAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

