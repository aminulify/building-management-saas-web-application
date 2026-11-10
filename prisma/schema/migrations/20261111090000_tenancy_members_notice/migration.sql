-- Tenants Directory: household size and "notice given"
ALTER TABLE "RentalAgreement" ADD COLUMN "members" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "noticeGivenAt" TIMESTAMPTZ;
