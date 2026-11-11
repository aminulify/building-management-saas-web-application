-- Owner Profile: the owner asked the tenant to sign the agreement
ALTER TABLE "RentalAgreement" ADD COLUMN "signatureRequestedAt" TIMESTAMPTZ;
