-- Maintenance: a readable ticket number (REQ-1001, 1002, ...) and the time a request was resolved
CREATE SEQUENCE "MaintenanceRequest_ticketNo_seq" START 1001;
ALTER TABLE "MaintenanceRequest" ADD COLUMN "ticketNo" INTEGER NOT NULL DEFAULT nextval('"MaintenanceRequest_ticketNo_seq"');
ALTER SEQUENCE "MaintenanceRequest_ticketNo_seq" OWNED BY "MaintenanceRequest"."ticketNo";
CREATE UNIQUE INDEX "MaintenanceRequest_ticketNo_key" ON "MaintenanceRequest"("ticketNo");

ALTER TABLE "MaintenanceRequest" ADD COLUMN "resolvedAt" TIMESTAMPTZ;
UPDATE "MaintenanceRequest" SET "resolvedAt" = "updatedAt" WHERE status = 'COMPLETED';

CREATE INDEX "MaintenanceRequest_createdAt_idx" ON "MaintenanceRequest"("createdAt" DESC);
