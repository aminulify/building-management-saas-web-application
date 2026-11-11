-- Manage Home lists the newest posting first
CREATE INDEX IF NOT EXISTS "Listing_type_createdAt_id_idx" ON "Listing"("type", "createdAt" DESC, "id" DESC);
