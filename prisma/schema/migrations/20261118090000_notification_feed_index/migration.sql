-- Tenant Notifications page: newest-first paging of one person's open notifications
CREATE INDEX "Notification_userId_archivedAt_id_idx" ON "Notification"("userId", "archivedAt", "id" DESC);
