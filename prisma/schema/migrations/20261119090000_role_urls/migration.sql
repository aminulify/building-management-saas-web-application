-- Role-based URLs: Apartment Owner → /home-owner, Verified Tenant → /tenant, Tenant-Free → /tenant-free.
-- Links stored in earlier notifications are moved to the new addresses so nothing points at a page that is gone.
UPDATE "Notification" SET "link" = '/home-owner' || substr("link", 7) WHERE "link" = '/owner' OR "link" LIKE '/owner/%';
-- pages a tenant never had
UPDATE "Notification" SET "link" = '/tenant/dashboard' WHERE "link" IN ('/tenant/rent', '/tenant/rental');
-- a person who is Tenant-Free today follows /tenant-free (their old /tenant links would only redirect)
UPDATE "Notification" n SET "link" = '/tenant-free' || substr(n."link", 8) FROM "User" u WHERE u."id" = n."userId" AND u."role" = 'GENERAL_USER' AND n."link" LIKE '/tenant/%';
