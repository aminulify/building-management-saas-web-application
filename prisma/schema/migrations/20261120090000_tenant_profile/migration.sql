-- Tenant Free / Tenant profile page: a permanent Tenant ID, the member count, and a tenant's own agreement document
CREATE SEQUENCE IF NOT EXISTS tenant_code_seq START 100001;

ALTER TABLE "User" ADD COLUMN "tenantCode" TEXT;
CREATE UNIQUE INDEX "User_tenantCode_key" ON "User"("tenantCode");

-- everyone who is a Tenant-Free account or a verified tenant today gets an ID, oldest account first
UPDATE "User" u SET "tenantCode" = 'TF' || nextval('tenant_code_seq')
FROM (SELECT id FROM "User" WHERE role IN ('GENERAL_USER', 'TENANT') AND "tenantCode" IS NULL ORDER BY "createdAt", id) s
WHERE u.id = s.id;

ALTER TABLE "TenantProfile" ADD COLUMN "members" INTEGER NOT NULL DEFAULT 1;

ALTER TYPE "DocKind" ADD VALUE IF NOT EXISTS 'AGREEMENT';
