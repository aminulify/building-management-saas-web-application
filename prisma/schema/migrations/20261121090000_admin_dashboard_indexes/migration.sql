-- Super Admin dashboard: revenue of a date range, plan holders per audience, the role-filtered Active Plans list
CREATE INDEX IF NOT EXISTS "PaymentTransaction_status_purpose_verifiedAt_idx" ON "PaymentTransaction"("status", "purpose", "verifiedAt");
CREATE INDEX IF NOT EXISTS "UserSubscription_audience_status_idx" ON "UserSubscription"("audience", "status");
CREATE INDEX IF NOT EXISTS "User_role_id_idx" ON "User"("role", "id" DESC);
