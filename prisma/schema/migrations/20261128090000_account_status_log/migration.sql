-- Active Owners page: a warning state and a permanent comment log for every status change
CREATE TYPE "AccountAction" AS ENUM ('ACTIVE', 'WARNING', 'SUSPENDED', 'ARCHIVED');

ALTER TABLE "User" ADD COLUMN "warnedAt" TIMESTAMPTZ;

CREATE TABLE "AccountStatusLog" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "adminId" UUID NOT NULL,
  "adminUsername" TEXT NOT NULL,
  "action" "AccountAction" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountStatusLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountStatusLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountStatusLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AccountStatusLog_userId_createdAt_idx" ON "AccountStatusLog"("userId", "createdAt" DESC);
