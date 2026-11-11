-- Tenant Maintenance page: preferred repair date/time, and a fast "my requests by status, newest first" lookup
ALTER TABLE "MaintenanceRequest" ADD COLUMN "preferredAt" TIMESTAMPTZ;
CREATE INDEX "MaintenanceRequest_tenantId_status_createdAt_idx" ON "MaintenanceRequest"("tenantId", "status", "createdAt" DESC);
