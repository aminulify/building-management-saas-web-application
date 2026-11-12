-- Super Admin can delete a boost from the Paid Boost table; the row and its payment stay for the books
ALTER TABLE "ListingBoost" ADD COLUMN "deletedAt" TIMESTAMPTZ;
