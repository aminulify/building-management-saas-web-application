# AmaderGhor — System Architecture

Nov 8, 2026 · @Aminul Islam Fahad

## 1. Scope and business-rule decisions

AmaderGhor is built as one Next.js monorepo with a separate realtime service, PostgreSQL as the single source of truth, and server-side RBAC plus entitlement checks on every mutation. The three specs conflict in places; the decisions below are the working defaults until the product owner confirms them.

| # | Conflict or gap in spec | Working decision | Confirm with PO |
| --- | --- | --- | --- |
| D1 | Plan limits overlap (Primary 1–2, Millionaire 2–4 properties; units 1–40 / 41–160) | Treat ranges as **maximum caps**: Primary 2 props / 40 units, Millionaire 4 / 160, Billionaire 12 / 500. The lower bound is marketing copy only. | Yes |
| D2 | spec.md says tenants/general users can never list; pages.md adds an optional **Marketplace Seller Plan** | Follow pages.md (newer). Seller Plan is a separate plan type with listing limit and expiry; price is unspecified. | Price, limit, duration |
| D3 | Owner listing limit is not defined per tier | Add `listingLimit` to every plan, configurable by Super Admin. Seed: 5 / 15 / 50. | Seed values |
| D4 | "Free-tier owners" mentioned, but owners must pay | No free owner tier. A new owner without a plan can log in and see the dashboard in read-only/onboarding mode only. | Yes |
| D5 | SOS: spec.md says tenant **or landlord**; pages.md only tenant | Both Tenant and Owner can raise SOS. | Yes |
| D6 | Gov Admin listing rights: "No, unless authorized" | Model as a permission flag `listing:create` that Super Admin can grant to a Gov Admin. | No |
| D7 | Messaging: General User has no private chat "unless a marketplace inquiry" | A listing inquiry creates a `LISTING_INQUIRY` conversation between seeker and seller, scoped to that listing. | Yes |
| D8 | No payment gateway named; product owner specified manual bKash Send Money with Super Admin approval | Phase 1: subscriptions are paid by bKash Send Money and activated by Super Admin TrxID review (section 9.2–9.3). Rent is recorded by owners. Gateway IPN in phase 2. | No (confirmed) |
| D9 | Pro-rated upgrades / downgrades | Upgrade: immediate, charge remaining-days difference. Downgrade: at next renewal, blocked if current usage exceeds new caps. | Yes |
| D10 | Grace period "e.g. 3 days" | 3 days, configurable. During grace: read and rent tracking allowed, new listings and new units blocked. | No |
| D11 | SOS "routes to police" | Platform cannot guarantee police receipt. UI shows two states: *received by AmaderGhor* and *forwarded by Gov Admin* (with forwarding reference). | No |
| D12 | Payments go to a bKash Personal number (01686621361) | Number stored in PlatformSetting, editable by Super Admin. Collecting business payments on a personal account may conflict with bKash personal-account terms; plan a bKash Merchant or PGW account before scaling. | Yes |
| D13 | Approval upgrades a Free Tenant to Apartment Owner; a user has one role | GENERAL\_USER, and TENANT without an active agreement, become OWNER on approval. A TENANT with an active agreement is blocked with a message until the tenancy ends. | Yes |
| D14 | Owner ID format (e.g. OW10052) | OW + database sequence starting at 10001, assigned once, never reused. | No |
| D15 | bKash reference = \[Username\], but registration has no username field | Add a unique username (3–20 lowercase letters, digits) to registration; it is shown in the modal as the reference. | No |

Role names used in code: `SUPER_ADMIN`, `GOV_ADMIN`, `OWNER` (apartment-owner-admin), `TENANT` (tenant-admin), `GENERAL_USER` (tenant-free-account-admin).

## 2. Tech stack

The proposed stack is kept, with four corrections: Socket.IO runs as its own Node service, PostGIS is added for proximity search, a job queue is added for billing and notifications, and Supabase is used for Auth and Storage only while Prisma owns the schema.

| Layer | Choice | Note |
| --- | --- | --- |
| Framework | Next.js 15 (App Router), React Server Components | Public pages SSR/ISR for SEO; dashboards client-heavy |
| Language | TypeScript (strict) | Shared types across web and realtime via `packages/shared` |
| Styling / UI | Tailwind CSS v4 + shadcn/ui + Framer Motion | Glass tokens as CSS variables; `prefers-reduced-motion` respected |
| Forms / validation | React Hook Form + Zod | Same Zod schema runs on client and server |
| Data fetching | TanStack Query (client), Server Actions for simple forms | Route Handlers for anything called by mobile/realtime later |
| Database | PostgreSQL 16 + **PostGIS** | `geography(Point)` for listings, properties, facilities, SOS |
| ORM | Prisma | PostGIS columns via `Unsupported("geography")` + raw SQL for radius queries |
| Auth | Supabase Auth (email/phone OTP, password) | Role and status live in our `User` table, not in JWT claims alone |
| File storage | Supabase Storage, private buckets + signed URLs | NID and ownership docs never public |
| Realtime | **Socket.IO on a separate Node service** + Redis adapter | Vercel serverless cannot hold WebSockets |
| Cache / pub-sub / rate limit | Redis (Upstash or self-hosted) | Presence, socket fan-out, OTP and login rate limits |
| Background jobs | BullMQ on Redis (worker in realtime service) | Renewals, expiry reminders, payment retry, rent reminders |
| Payments | Phase 1: manual bKash Send Money + Super Admin TrxID review. Phase 2: SSLCommerz or bKash Tokenized API | Activation only by Super Admin approval (phase 1) or verified IPN (phase 2) |
| SMS / Email | BD SMS gateway (e.g. SSL Wireless / Alpha SMS) + Resend or SES | Behind a `NotificationProvider` interface |
| i18n | next-intl, locale in URL (`/bn`, `/en`) | Default `bn`; fonts switch per locale |
| Maps | Leaflet + OpenStreetMap tiles | Google Maps optional later; facility data seeded from OSM |
| Voice/Video | LiveKit (phase 2) | Call metadata table ready from phase 1 |
| PDF | `@react-pdf/renderer` server-side | Invoices, receipts, incident reports |
| Testing | Vitest, Testing Library, Playwright, Prisma test DB | Permission matrix covered by table-driven tests |
| Observability | Sentry, pino logs, OpenTelemetry later |  |
| Hosting | Web on Vercel; realtime + worker on Railway/Fly/VPS; DB on Supabase or Neon (PostGIS) | Same region (Singapore) for latency to BD |

## 3. High-level system architecture

Two deployable apps share one database: the Next.js web app serves pages and the REST API, and a long-running Node service holds WebSockets and background jobs. They talk through Redis pub/sub and a signed internal endpoint.

&#91;embedded content: system architecture · 2 apps, 3 data services, 2 external providers\]

Every write goes through the web app's service layer into PostgreSQL first; the realtime service only fans out what is already committed. LiveKit (phase 2) gets its room tokens from the web app and is not drawn.

## 4. Roles and permission system

Access = **role permission** AND **resource scope** AND (for paid features) **entitlement**. All three are checked on the server in one `authorize()` call; the frontend only hides buttons.

### 4.1 Three layers

1. **Role → permissions** (static map in code, `packages/shared/permissions.ts`, overridable per Gov Admin via `UserPermissionOverride`).
2. **Scope** — which rows the user may touch: `own` (owner's properties), `assigned` (tenant's active agreement), `all` (admins).
3. **Entitlement** — computed from the active `UserSubscription` / `MarketplaceEntitlement`: `canManageProperties`, `canCreateListing`, `propertyLimit`, `unitLimit`, `listingLimit`, `featureFlags`.

### 4.2 Permission matrix

| Permission | SUPER\_ADMIN | GOV\_ADMIN | OWNER | TENANT | GENERAL\_USER |
| --- | --- | --- | --- | --- | --- |
| `marketplace:browse`, `favorite:manage`, `listing:report` | all | all | all | all | all |
| `listing:create` | yes | only if granted | entitlement | seller entitlement | seller entitlement |
| `listing:manage` | all | report only | own | own | own |
| `listing:moderate` | yes | flag only | — | — | — |
| `property:*`, `unit:*` | all (read/suspend) | read | own + entitlement | — | — |
| `tenancy:*`, `rent:record` | read | read (no finances) | own | read own | — |
| `rent:pay` | — | — | — | own | — |
| `maintenance:create` | — | — | — | own | — |
| `maintenance:manage` | all | read | own | own (cancel/comment) | — |
| `complaint:create` | — | — | yes | yes | yes |
| `complaint:manage` | all | assigned | — | own | own |
| `sos:create` | — | — | yes | yes | — |
| `sos:respond` | escalate | yes | — | — | — |
| `people:search` (NID/phone/email) | yes | yes | — | — | — |
| `user:manage`, `govadmin:manage` | yes | — | — | — | — |
| `plan:manage`, `pricing:manage`, `payment:refund` | yes | — | — | — | — |
| `subscription:purchase` | — | — | owner plans | seller plan | seller plan |
| `audit:read`, `settings:manage` | yes | own actions | — | — | — |
| `broadcast:send` | yes | — | — | — | — |
| upgrade:request | — | — | own | own | own |
| upgrade:review (approve / reject) | yes | — | — | — | — |

### 4.3 Messaging and call rules

`canCommunicate(sender, recipient)` is a pure function shared by API and socket server:

- SUPER\_ADMIN → anyone.
- GOV\_ADMIN → OWNER, TENANT, SUPER\_ADMIN, GOV\_ADMIN.
- OWNER → TENANTs with an active agreement on the owner's units; SUPER\_ADMIN via Support channel.
- TENANT → the OWNER of the active agreement; SUPER\_ADMIN via Support channel.
- GENERAL\_USER → SUPER\_ADMIN via Support; a seller only through a `LISTING_INQUIRY` conversation.
- Anyone → can reply in a conversation an admin opened with them.

### 4.4 Implementation pattern

```ts
// every route handler / server action
const actor = await requireActor();               // session + User row, rejects SUSPENDED
await authorize(actor, 'unit:create', { propertyId }); // role + scope
await assertEntitlement(actor, 'unit', { delta: 1 });  // plan caps, grace state
```

Next.js `middleware.ts` only does coarse routing (`/owner/*` needs OWNER). It is never the security boundary.

Super Admin and Gov Admin accounts are created only by a Super Admin (or the seed script); public registration offers OWNER, TENANT, GENERAL\_USER. The last active Super Admin cannot be suspended or demoted.

## 5. Database tables and relationships

About 50 tables in 10 domains. The spec's "Marketplace Entitlements" module is derived, not stored: it comes from an ACTIVE/GRACE UserSubscription (OWNER or SELLER audience) plus any UserPermissionOverride. All ids are UUID v7, all money is `Decimal(12,2)` in BDT, all timestamps are `timestamptz` (displayed in Asia/Dhaka), and soft-delete uses `archivedAt` + `archiveReason` so the Previous Properties / Owners / Tenants pages are queries, not separate tables.

### 5.1 Tables by domain

| Domain | Table | Key columns | Relations |
| --- | --- | --- | --- |
| Identity | `User` | authId (Supabase), role, status (ACTIVE/SUSPENDED/BANNED/INACTIVE/DELETED), email, phone, nidNumber (encrypted) + nidHash, verificationStatus, locale, archivedAt, archiveReason | 1–1 profile tables |
| Identity | `OwnerProfile` | userId, businessName, addressId | User 1–1 |
| Identity | `TenantProfile` | userId, emergencyContact, occupation | User 1–1 |
| Identity | `GovAdminProfile` | userId, department, designation, createdById | User 1–1 |
| Identity | `UserPermissionOverride` | userId, permission, granted, grantedById | User 1–N |
| Identity | `Address` | division, district, upazila, area, street, postalCode | shared |
| Identity | `VerificationDocument` | ownerType (USER/PROPERTY/LISTING), ownerId, kind (NID\_FRONT, NID\_BACK, DEED…), storageKey, status, reviewerId, notes | polymorphic |
| Geography | `Division`, `District`, `Upazila`, `Zone` | nameBn, nameEn, parentId, `geom` | hierarchy |
| Geography | `Facility` | type (MOSQUE, SCHOOL, COLLEGE, UNIVERSITY, HOSPITAL, MARKET, PARK, PLAYGROUND, HIGHWAY), nameBn, nameEn, `location geography` | used by proximity search |
| Property | `Property` | ownerId, name, type, addressId, zoneId, totalFloors, `location`, securityFeatures\[\], status, verificationStatus, archivedAt, archiveReason | Owner 1–N, Unit 1–N |
| Property | `PropertyImage` | propertyId, storageKey, order | Property 1–N |
| Property | `Unit` | propertyId, unitNumber, floor, bedrooms, bathrooms, areaSqft, rent, deposit, utilityCharge, furnishing, availability | unique (propertyId, unitNumber) |
| Tenancy | `RentalAgreement` | unitId, tenantId, ownerId, rent, deposit, startDate, endDate, status (INVITED/ACTIVE/ENDED/TERMINATED), settlementAmount, agreementDocKey | **partial unique index: one ACTIVE per unit** |
| Tenancy | `TenantInvitation` | ownerId, unitId, email/phone, tokenHash, expiresAt, acceptedAt |  |
| Tenancy | `RentRecord` | agreementId, billingMonth (date, 1st of month), rent, utility, other, total, paid, dueDate, status (DUE/PARTIAL/PAID/OVERDUE) | unique (agreementId, billingMonth) |
| Tenancy | `RentPayment` | rentRecordId, amount, method (CASH/BKASH/NAGAD/ROCKET/BANK/CARD), reference, paidAt, recordedById, status | unique (method, reference) |
| Operations | `MaintenanceRequest` | agreementId, unitId, tenantId, category, title, description, priority, status (PENDING/APPROVED/IN\_PROGRESS/COMPLETED/REJECTED/CANCELLED), technicianName | images, comments 1–N |
| Operations | `MaintenanceComment`, `MaintenanceImage` | requestId, authorId, body / storageKey |  |
| Operations | `Complaint` | reporterId, category, subject, description, propertyId?, assignedToId, status, resolution | `ComplaintEvent` 1–N |
| Billing | `SubscriptionPlan` | code, nameBn, nameEn, audience (OWNER/SELLER), monthlyPrice, quarterlyDiscount, yearlyDiscount, propertyLimit, unitLimit, listingLimit, listingDurationDays, features (jsonb flags), isActive, version |  |
| Billing | `PlanPriceHistory` | planId, field, oldValue, newValue, effectiveAt, changedById |  |
| Billing | `UserSubscription` | userId, planId, planSnapshot (jsonb), cycle (MONTHLY/QUARTERLY/YEARLY), amount, startsAt, endsAt, graceEndsAt, status (PENDING/ACTIVE/GRACE/EXPIRED/CANCELLED), autoRenew | **partial unique: one ACTIVE/GRACE per (userId, audience)** |
| Billing | `PaymentTransaction` | userId, purpose (SUBSCRIPTION/RENT/PROMOTION), subscriptionId?, amount, gateway, gatewayTxnId (unique), status (INITIATED/SUCCESS/FAILED/REFUNDED), rawPayload, verifiedAt |  |
| Billing | `Invoice` | transactionId, number (sequential, unique), pdfKey |  |
| Marketplace | `Listing` | sellerId, propertyId?, unitId?, type (RENT/SALE), category (FLAT/APARTMENT/BUILDING/LAND/COMMERCIAL), title, description, price, negotiable, area, areaUnit, bedrooms, bathrooms, floor, totalFloors, furnishing, landDetails (jsonb), zoneId, `location`, amenities\[\], status (DRAFT/PENDING/PUBLISHED/REJECTED/SUSPENDED/SOLD/RENTED/EXPIRED/ARCHIVED), isFeatured, expiresAt, rejectionReason | images, docs 1–N |
| Marketplace | `ListingImage`, `ListingDocument` | listingId, storageKey, order |  |
| Marketplace | `ListingFacilityDistance` | listingId, facilityType, nearestFacilityId, distanceM | precomputed on publish |
| Marketplace | `Favorite` | userId, listingId | unique (userId, listingId) |
| Marketplace | `SavedSearch` | userId, query (jsonb) |  |
| Marketplace | `ListingReport` | listingId, reporterId, category, description, status | unique (listingId, reporterId) while open |
| Marketplace | `ListingStatDaily` | listingId, date, views, inquiries |  |
| Communication | `Conversation` | type (DIRECT/SUPPORT/LISTING\_INQUIRY/INSPECTION), listingId?, lastMessageAt |  |
| Communication | `ConversationParticipant` | conversationId, userId, lastReadMessageId, archivedAt, pinned |  |
| Communication | `Message` | conversationId, senderId, body, attachments (jsonb), createdAt, deletedForIds\[\] | index (conversationId, createdAt) |
| Communication | `Call` | conversationId, callerId, calleeId, kind (AUDIO/VIDEO), status, startedAt, endedAt |  |
| Alerts | `EmergencyAlert` | reporterId, propertyId, unitId, type (FIRE/THEFT/SECURITY/LEAKAGE/MEDICAL/OTHER), description, `location`, addressSnapshot, reporterSnapshot (name, phone, NID last 4), status (NEED\_ACTION/PROCESSING/SOLVED/FALSE\_ALARM), priority, assignedOfficerId, acknowledgedAt, resolvedAt, dedupeKey | events 1–N |
| Alerts | `EmergencyAlertEvent` | alertId, actorId, action (ACK/ASSIGN/FORWARD/STATUS/NOTE), fromStatus, toStatus, forwardTo (POLICE\_999/FIRE/AMBULANCE), forwardRef, note | append-only |
| Alerts | `IncidentReport` | alertId?, type, findings, resolution, officerId, status | Alert 1–N |
| System | `Notification` | userId, type, titleKey, params (jsonb), link, readAt, archivedAt, priority |  |
| System | `Broadcast` | createdById, audience (roles\[\]), title, body, sentAt |  |
| System | `AuditLog` | actorId, actorRole, action, resourceType, resourceId, before (jsonb), after (jsonb), ip, userAgent, createdAt | **append-only** (DB role without UPDATE/DELETE) |
| System | `PlatformSetting` | key, value (jsonb), isSecret |  |
| System | `CmsContent`, `ContactInquiry` | key, locale, data / name, email, phone, subject, message |  |

### 5.2 Key relationships and integrity rules

- User 1–N Property 1–N Unit 1–N RentalAgreement; at most **one ACTIVE agreement per unit** (partial unique index `WHERE status='ACTIVE'`).
- RentalAgreement 1–N RentRecord 1–N RentPayment. A cron job generates the month's RentRecord for every ACTIVE agreement on the 1st (idempotent via the unique key).
- User 1–N UserSubscription; only one ACTIVE/GRACE per audience, so an owner plan and a seller plan can coexist (spec: "free rental access and a separate seller entitlement").
- UserSubscription stores `planSnapshot` so later price or limit edits never change past invoices.
- Listing N–1 seller (User), optionally N–1 Property/Unit; a second PUBLISHED listing on the same unit is flagged for review.
- EmergencyAlert 1–N EmergencyAlertEvent and 1–N IncidentReport; alerts are never deleted.
- Users are never hard-deleted: status DELETED + PII scrubbed after retention period, so financial and audit history stay intact.
- Entitlement counts (properties, units, listings) are checked inside the same DB transaction as the insert, with `SELECT … FOR UPDATE` on the subscription row to prevent race overruns.

### 5.3 Additions for the manual bKash upgrade flow

| Table | Change | Purpose |
| --- | --- | --- |
| `User` | add `username` (unique), `ownerCode` (unique, nullable, e.g. `OW10052`) | bKash reference; Owner ID shown on owner profile and receipts |
| `UpgradeRequest` (new) | userId, planId, cycle, expectedAmount, quoteSnapshot (jsonb), senderNumber, trxId (**unique**), status (PENDING/APPROVED/REJECTED/CANCELLED), reviewerId, reviewedAt, rejectionReason, fromRole, toRole | One row per modal submission; partial unique index allows one PENDING per user |
| `PaymentTransaction` | gateway adds `MANUAL_BKASH`; status adds `PENDING_REVIEW`; link `upgradeRequestId` | Same ledger for manual and future gateway payments |
| `owner_code_seq` (sequence) | starts at 10001 | Generates Owner IDs inside the approval transaction |

## 6. API catalog

REST Route Handlers under `/api/v1`, JSON, Zod-validated, cursor pagination (`?cursor=&limit=`), errors as `{ code, message, details }` with i18n keys. Every mutating endpoint writes an AuditLog entry when it touches money, status, roles or permissions.

| Group | Endpoints | Roles |
| --- | --- | --- |
| Auth | `POST /auth/register` · `POST /auth/otp/send` · `POST /auth/otp/verify` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/password/forgot` · `POST /auth/password/reset` · `GET /me` · `PATCH /me` · `POST /me/documents` | public / self |
| Geography | `GET /geo/divisions` · `GET /geo/districts?division=` · `GET /geo/upazilas?district=` · `GET /geo/zones?q=` · `GET /geo/facilities?bbox=&type=` | public |
| CMS / public | `GET /cms/:key` · `GET /plans` · `POST /contact` | public |
| Marketplace | `GET /listings` (filters, radius, sort) · `GET /listings/stats` · `GET /listings/:id` · `POST /listings/:id/view` · `GET /listings/eligibility` · `POST /listings` (draft) · `PATCH /listings/:id` · `POST /listings/:id/submit` · `POST /listings/:id/{renew,mark-sold,mark-rented,deactivate,archive}` · `POST /listings/:id/images` · `GET /me/listings` | browse: all; write: entitled |
| Favorites / search | `GET /me/favorites` · `PUT /me/favorites/:listingId` · `DELETE /me/favorites/:listingId` · `GET/POST/DELETE /me/saved-searches` | authenticated |
| Reports / inquiry | `POST /listings/:id/reports` · `POST /listings/:id/inquiries` (opens LISTING\_INQUIRY conversation) | authenticated |
| Moderation | `GET /admin/listings?status=` · `POST /admin/listings/:id/{approve,reject,suspend,restore,feature,unfeature}` · `GET /admin/listings/:id/reports` · `GET /admin/marketplace/analytics` | SUPER\_ADMIN (GOV\_ADMIN: read + flag) |
| Properties | `GET/POST /properties` · `GET/PATCH /properties/:id` · `POST /properties/:id/archive` · `POST /properties/:id/images` | OWNER (own) |
| Units | `GET/POST /properties/:id/units` · `GET/PATCH /units/:id` · `POST /units/:id/{archive,mark-available}` | OWNER |
| Tenancy | `GET /tenancies?status=` · `POST /tenancies/invite` · `POST /invitations/:token/accept` · `GET/PATCH /tenancies/:id` · `POST /tenancies/:id/end` · `GET /tenancies/:id/agreement` (signed URL) | OWNER; TENANT read own |
| Rent | `GET /rent/overview?month=` · `GET /rent/records?agreementId=` · `POST /rent/records/:id/payments` · `POST /rent/payments/:id/verify` · `POST /rent/records/:id/remind` · `GET /rent/payments/:id/receipt` · `GET /rent/export` | OWNER; TENANT read own |
| Tenant self | `GET /tenant/summary` · `GET /tenant/rental` · `POST /tenant/rent/:recordId/pay` (phase 2) | TENANT |
| Dashboards | `GET /dashboard/owner` · `GET /dashboard/tenant` · `GET /dashboard/gov` · `GET /dashboard/admin` | per role |
| Maintenance | `GET/POST /maintenance` · `GET /maintenance/:id` · `POST /maintenance/:id/{approve,reject,assign,status,complete,cancel}` · `POST /maintenance/:id/comments` · `GET /maintenance/stats` | TENANT create; OWNER manage |
| Complaints | `GET/POST /complaints` · `GET /complaints/:id` · `POST /complaints/:id/{assign,status,notes,resolve,reopen}` | all create; admins manage |
| Subscriptions | `GET /me/subscription` · `POST /subscriptions/quote` (cycle, plan → server price, proration) · `POST /upgrade-requests` · `POST /subscriptions/:id/{cancel,renew}` · `POST /subscriptions/change-plan` · `GET /me/payments` · `GET /invoices/:id/pdf` | OWNER, TENANT, GENERAL\_USER |
| Payment webhooks | `POST /webhooks/sslcommerz/ipn` · `POST /webhooks/bkash` · `GET /payments/return` | phase 2 only: gateway (signature + validation call) |
| Plans admin | `GET/POST /admin/plans` · `PATCH /admin/plans/:id` · `POST /admin/plans/:id/{activate,deactivate}` · `DELETE /admin/plans/:id` (unused only) · `POST /admin/plans/:id/schedule-price` | SUPER\_ADMIN |
| Payments admin | `GET /admin/payments` · `POST /admin/payments/:id/{verify,refund}` · `GET /admin/payments/export` | SUPER\_ADMIN |
| Users admin | `GET/POST /admin/users` · `PATCH /admin/users/:id` · `POST /admin/users/:id/{suspend,activate,archive,role,permissions,verify}` · `GET /admin/archive/{properties,owners,tenants}` | SUPER\_ADMIN; GOV\_ADMIN read |
| Gov oversight | `GET /gov/owners` · `GET /gov/tenants` · `GET /gov/properties` · `GET /gov/people/search?q=&by=nid\|phone\|email\|id` · `GET /gov/archive/{properties,owners,tenants}` | GOV\_ADMIN, SUPER\_ADMIN |
| Emergency | `POST /sos` · `GET /sos/mine` · `GET /gov/alerts?status=` · `GET /gov/alerts/:id` · `POST /gov/alerts/:id/{ack,assign,forward,status,notes}` · `GET/POST /gov/incidents` · `GET /gov/incidents/:id/pdf` · `GET /admin/alerts` · `POST /admin/alerts/:id/escalate` | OWNER/TENANT create; GOV respond |
| Messaging | `GET /conversations` · `POST /conversations` (checks `canCommunicate`) · `GET /conversations/:id/messages?before=` · `POST /conversations/:id/messages` (fallback if socket down) · `POST /conversations/:id/read` · `POST /conversations/:id/archive` · `POST /uploads/sign` | per matrix |
| Calls (phase 2) | `POST /calls` (returns LiveKit token) · `POST /calls/:id/end` | per matrix |
| Notifications | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `POST /notifications/:id/archive` · `POST /admin/broadcasts` | all; broadcast SUPER\_ADMIN |
| System | `GET /admin/audit-logs` · `GET /admin/analytics?from=&to=` · `GET/PATCH /admin/settings` · `POST /admin/settings/test-{email,payment}` | SUPER\_ADMIN |
| Internal | `POST /internal/realtime/emit` (web → realtime, HMAC-signed) · `GET /health` | service only |
| Upgrade requests | GET /upgrade-requests/mine · POST /upgrade-requests/:id/cancel · GET /admin/upgrade-requests?status=PENDING · POST /admin/upgrade-requests/:id/approve · POST /admin/upgrade-requests/:id/reject (reason) · GET /settings/payment-info (bKash number) | requester (own); review SUPER\_ADMIN |

**Create Listing guard flow:** the button calls `GET /listings/eligibility`. `403 LISTING_ENTITLEMENT_REQUIRED` → client pushes `/pricing?reason=listing` and fires the toast *"Buy a subscription for listing your item."* (Bangla string from `messages/bn.json`) once per click. `POST /listings` repeats the same check server-side, so the frontend is never trusted.

## 7. Real-time messaging design

PostgreSQL stores every message first; Socket.IO only delivers it. If the socket is down, the REST fallback still saves the message and the client catches up on reconnect.

### 7.1 Components

- **realtime service** (`apps/realtime`): Node + Socket.IO + `@socket.io/redis-adapter`, horizontally scalable.
- **Auth on connect:** client sends the Supabase access token in `handshake.auth.token`; server verifies the JWT, loads `User` (role, status), rejects SUSPENDED/BANNED.
- **Rooms:** `user:{id}` (personal: notifications, SOS acks, call invites), `conv:{id}` (joined only after a participant check), `role:GOV_ADMIN` (SOS hub), `role:SUPER_ADMIN`.
- **Presence:** Redis set `presence:{userId}` with socket ids + 60 s TTL heartbeat; `● Online / ● Offline` and `lastSeenAt` pushed only to users who share a conversation.

### 7.2 Events

| Direction | Event | Payload / effect |
| --- | --- | --- |
| C → S | `conv:join` / `conv:leave` | server checks ConversationParticipant |
| C → S | `msg:send` | `{ clientId, conversationId, body, attachments[] }` → validate, `canCommunicate`, rate-limit (20/10 s), insert, ack `{ clientId, id, createdAt }` |
| S → C | `msg:new` | broadcast to `conv:{id}`; also `notify:new` to offline participants' `user:` room + push/SMS digest later |
| C → S | `msg:read` | `{ conversationId, messageId }` → update `lastReadMessageId` |
| S → C | `msg:receipt` | sender sees `✓` (saved), `✓✓` grey (delivered to an online device), `✓✓` green (read) |
| C ↔ S | `typing:start` / `typing:stop` | throttled, not stored |
| S → C | `presence:update` | `{ userId, online, lastSeenAt }` |
| S → C | `notify:new` | in-app notification badge |
| C ↔ S | `call:invite` / `call:accept` / `call:reject` / `call:end` | phase 2: signalling only; media through LiveKit room token from `POST /calls` |
| S → C | upgrade:new | to role:SUPER\_ADMIN; adds the request to Pending Role Upgrades and bumps the badge |
| S → C | account:upgraded / upgrade:rejected | to user:{id}; client refreshes session and redirects to Owner Dashboard, or shows the rejection reason |

### 7.3 Rules

- Idempotency: the client generates `clientId` (UUID); a unique index on `(senderId, clientId)` stops double sends on retry.
- Ordering: messages sorted by `(createdAt, id)`; pagination with `before` cursor, 30 per page.
- Support Center: one pinned SUPPORT conversation per user, auto-created at signup, routed to the Super Admin team (any SUPER\_ADMIN can answer).
- Attachments: client gets a signed upload URL (`/uploads/sign`), max 10 MB, images/PDF only, virus-scan hook later; message stores only the storage key.
- Web → realtime: API routes that need to push (new rent record, SOS, broadcast) call `POST /internal/realtime/emit` with an HMAC signature, or publish to a Redis channel the realtime service subscribes to.
- Unread counts derive from `lastReadMessageId`, so no counter drift.

## 8. Critical alerts (Emergency SOS) design

An SOS is committed to the database before anything else, then fanned out on three independent channels (socket, SMS, polling) so one failure never loses an alert. The reporter always sees which stage it has reached.

### 8.1 Flow

1. **Trigger:** OWNER or TENANT taps the red SOS button → bottom sheet with type (Fire, Theft/Security, Gas/Water Leakage, Medical, Other), optional note, *Hold 2 s to send* (prevents pocket taps). Phone dial shortcuts to 999 / 102 (Fire) / 199 are shown immediately, before submission.
2. **Capture:** browser Geolocation (10 s timeout). If denied, fall back to the property's stored coordinates and address. Server attaches snapshots: name, phone, NID last 4 digits, property, floor, unit.
3. **Persist:** `POST /sos` → insert `EmergencyAlert` (status NEED\_ACTION) + first event, inside one transaction. Dedupe: same reporter + type within 3 minutes returns the existing alert. Rate limit 5/hour per user.
4. **Fan-out (after commit, via outbox table → worker):**
   - socket `sos:new` to room `role:GOV_ADMIN` (and `role:SUPER_ADMIN`);
   - SMS to on-duty Gov Admin phone numbers (configured in Platform Settings);
   - `Notification` rows with priority CRITICAL.
5. **Gov Admin Quick Alert hub:** red pulsing dot in the sidebar, looping alert sound (Web Audio, needs one user click per session to unlock audio — the hub shows an *Enable sound* banner until then), browser Notification API, live feed sorted by status then time, map pin.
6. **Respond:** Acknowledge → Assign officer → Dispatch buttons (`tel:999`, Fire Service, Ambulance) record a `FORWARD` event with method and reference → status changes → Solved.
7. **Reporter feedback:** `sos:update` to `user:{reporterId}`; the tenant screen shows *Received by AmaderGhor* → *Seen by Govt admin* → *Forwarded to Police/Fire (ref …)* → *Solved*. Wording never claims police received it unless a forward reference exists (spec 5.8).
8. **Escalation:** BullMQ delayed job: if not acknowledged in 2 minutes → re-alert all Gov Admins + Super Admin; at 5 minutes → SMS escalation list.
9. **Archive:** SOLVED / FALSE\_ALARM alerts stay queryable (municipal safety archive); IncidentReport can be created from the alert and exported as PDF.

### 8.2 State transitions

| From | To | Who | Required |
| --- | --- | --- | --- |
| NEED\_ACTION | PROCESSING | GOV\_ADMIN | acknowledge (sets acknowledgedAt) |
| PROCESSING | SOLVED | GOV\_ADMIN | resolution note |
| NEED\_ACTION or PROCESSING | FALSE\_ALARM | GOV\_ADMIN | reason |
| SOLVED | PROCESSING | GOV\_ADMIN | reopen reason |
| any | (escalated flag) | SUPER\_ADMIN, system | — |

UI badges: NEED\_ACTION and PROCESSING = red **UNSOLVED** (PROCESSING adds a yellow chip), SOLVED = green **SOLVED**. Every transition writes an `EmergencyAlertEvent` and an `AuditLog` row; alert rows are never deleted.

### 8.3 Reliability

- Gov Admin clients also poll `GET /gov/alerts?since=` every 15 s as a backstop to the socket.
- Outbox pattern guarantees fan-out runs at least once even if the web process dies after commit.
- Metrics: time-to-acknowledge and time-to-resolve, shown on Super Admin Emergency Monitoring.

## 9. Subscription and billing engine

Prices are always computed on the server from the current `SubscriptionPlan` row; the client only displays the quote. Phase 1 collects payment by bKash Send Money to a personal number; a subscription becomes ACTIVE only after a Super Admin verifies the Transaction ID (TrxID). A gateway IPN (SSLCommerz / bKash Tokenized) replaces manual review in phase 2 on the same data model.

### 9.1 Price formula

```latex
\text{total} = \text{monthlyPrice} \times \text{months} \times \left(1 - \frac{\text{discount}_{cycle}}{100}\right)
```

| Plan | Monthly (1 mo) | Quarterly (3 mo, −10%) | Yearly (12 mo, −20%) | Props / Units (cap) |
| --- | --- | --- | --- | --- |
| Primary | ৳159.00 | ৳429.30 | ৳1,526.40 | 2 / 40 |
| Millionaire | ৳299.00 | ৳807.30 | ৳2,870.40 | 4 / 160 |
| Billionaire | ৳699.00 | ৳1,887.30 | ৳6,710.40 | 12 / 500 |

Open question: charge exact paisa or round to whole taka (gateways accept decimals).

### 9.2 bKash upgrade payment modal

Every `Upgrade` button (Pricing page, Subscription Restriction page, Owner Subscriptions page, Create Listing redirect) opens one shared modal, `BkashUpgradeModal`. It first calls `POST /subscriptions/quote`, so every amount shown comes from the server.

**Layout, top to bottom**

| Region | Content | Style |
| --- | --- | --- |
| Header | Title **Upgrade Account to \[Selected Package\]** + close (×) | Bold, dark navy `#0F172A`; Bangla in Anek Bangla SemiBold |
| Order summary | Package name · Billing cycle (Monthly / Quarterly / Yearly, switchable pill) · Calculated amount (৳) · Discount savings (৳, hidden on Monthly) | Glass card; amount large and bold; savings as a green status badge |
| bKash payment box | bKash logo + `bKash Personal: 01686621361` + Copy button | Prominent bKash-pink box (`#E2136E` tint, pink border); copy shows a "Copied" tick |
| Instructions | The 7 numbered steps below, with amount and username filled in live | Numbered list, step numbers in pink circles; amount and reference copyable |
| Form | `SENDER BKASH NUMBER` and `TRANSACTION ID (TrxID)` inputs | `.glass-input`, icon on the left, uppercase label |
| Footer | Left: **Cancel** (outline) · Right: **Submit Upgrade Request 🚀** | Glass secondary button · solid bKash-pink primary with glow on hover |

The bKash number is not hard-coded: it is read from `PlatformSetting` key `payment.bkash.personalNumber`, which the Super Admin can change.

**Payment instructions shown in the modal**

1. Open your bKash Mobile App or dial `*247#`.
2. Select "Send Money".
3. Enter Personal Number: `01686621361`.
4. Enter exact amount: `৳ [Calculated Price]`.
5. Enter Reference: `[Username]` (e.g. `john323`).
6. Enter your bKash PIN to execute the transaction.
7. Copy the 10-character Transaction ID (TrxID) from the confirmation SMS or app.

**Form inputs**

| Field | Icon | Placeholder | Validation (client and server, same Zod schema) |
| --- | --- | --- | --- |
| SENDER BKASH NUMBER | Phone | `01XXXXXXXXX` | Required; Bangladesh mobile, 11 digits starting `013`–`019` |
| TRANSACTION ID (TrxID) | Key / code | `e.g. 9J28XK120A` | Required; exactly 10 letters or digits; stored uppercase; must not exist on any other request (unique index) |

**States**

- **Submitting:** button shows a spinner and is disabled; inputs locked.
- **Success:** modal closes, toast *"Upgrade request sent to Super-Admin for verification! ⏳"*, and the account header shows a yellow **Pending verification** badge.
- **Errors:** inline field errors; `TRXID_ALREADY_USED`; `UPGRADE_ALREADY_PENDING` (one open request per user); `PLAN_INACTIVE`. All messages exist in `en.json` and `bn.json`.
- **Accessibility:** focus trap, Esc = Cancel, copy confirmations announced through `aria-live`.
- **Abuse limits:** 5 submissions per user per hour; Cancel never creates a request.

### 9.3 Super-Admin approval loop

A submitted modal creates an `UpgradeRequest` in status PENDING; nothing unlocks until a Super Admin matches the TrxID and amount against the bKash statement and approves.

&#91;embedded content: upgrade approval loop · submit, review, approve or reject\]

A rejected request notifies the user with the reason; they can submit again with a correct TrxID.

**Pending Role Upgrades queue (Super Admin Dashboard)**

- Columns: Request ID · User (name, username, phone) · Current role · Requested plan + cycle · Expected amount (৳) · Sender bKash number · TrxID (copyable) · Submitted at · Waiting time.
- Actions: **Approve**, **Reject** (reason required), **View user**.
- Sidebar badge shows the pending count; requests waiting more than 24 hours are highlighted red.
- The page receives new requests live through socket event `upgrade:new` on room `role:SUPER_ADMIN`.

**What Approve does (one database transaction)**

1. `UpgradeRequest` → APPROVED, with `reviewerId` and `reviewedAt`.
2. `PaymentTransaction` → SUCCESS, gateway `MANUAL_BKASH`, `gatewayTxnId` = TrxID.
3. `UserSubscription` → ACTIVE with `planSnapshot`; `startsAt` = approval time, `endsAt` = start + billing cycle.
4. If the user is a free account (GENERAL\_USER): role → OWNER, an `OwnerProfile` is created, and a unique Owner ID is assigned (`OW` + sequence, e.g. `OW10052`).
5. Invoice number and PDF are generated; an `AuditLog` row records the reviewer and before/after state.

After commit, the entitlement cache is cleared and socket event `account:upgraded` reaches the user. Their session refreshes, the toast confirms the upgrade, and they land on the Owner Dashboard with Properties, Units and Tenants Directory unlocked. A notification and SMS are also sent.

**Existing owners** use the same modal to change plan or renew; approval changes only the subscription, and the Owner ID stays the same.

### 9.4 Subscription lifecycle

1. **Quote:** `POST /subscriptions/quote` returns amount, discount savings and any upgrade credit from the server.
2. **Request:** `POST /upgrade-requests` creates `UpgradeRequest` (PENDING) + `PaymentTransaction` (PENDING\_REVIEW) and notifies Super Admins.
3. **Activation:** Super Admin approval runs the transaction in 9.3. Rejection closes the request with a reason; nothing changes on the account.
4. **Renewal:** daily job at 09:00 Asia/Dhaka sends reminders 7, 3 and 1 day before `endsAt` (in-app toast, email, SMS). Renewal uses the same bKash modal and approval; no auto-renew in phase 1.
5. **Expiry and grace:** at `endsAt` → GRACE for 3 days. During GRACE: everything readable, rent recording allowed, new property/unit/listing blocked, listings stay published. A renewal request pending at grace end keeps GRACE until reviewed. After grace → EXPIRED: listings move to SUSPENDED (soft-lock), data kept, dashboard shows a renew banner.
6. **Upgrade:** quote subtracts unused days of the current plan × its daily rate from the new plan price; new limits apply on approval.
7. **Downgrade:** scheduled for next renewal; refused if current properties/units/listings exceed the target plan's caps (user must archive first).
8. **Cancel:** plan runs to `endsAt`, then EXPIRED. Refunds are manual bKash returns, recorded by a Super Admin.
9. **Seller Plan:** same modal and approval, audience SELLER; gives `listingLimit` and `listingDurationDays` to TENANT or GENERAL\_USER without changing their role.

### 9.5 Entitlement service

`getEntitlement(userId)` returns `{ status, plan, limits, usage, flags }`, cached in Redis for 60 s and invalidated on any subscription or payment change. Used by `assertEntitlement`, the dashboard banner and the Subscription Restriction page (`/pricing?reason=listing`).

### 9.6 Super Admin plan controls

Editing price, discount, limits or feature flags creates a new plan `version` and a `PlanPriceHistory` row; existing subscriptions keep their `planSnapshot` until renewal. A scheduled change applies at `effectiveAt`. Plans with subscribers cannot be deleted, only deactivated.

## 10. Folder structure

pnpm + Turborepo monorepo: two apps (web, realtime) and shared packages. Inside `apps/web`, code is organised by feature module, and every module owns its schema, server logic, components and tests, so each step of the build order lands in one folder.

```text
amaderghor/
├─ apps/
│  ├─ web/                          # Next.js 15
│  │  ├─ src/
│  │  │  ├─ app/
│  │  │  │  ├─ [locale]/
│  │  │  │  │  ├─ (public)/          # home, features, pricing, about, contact
│  │  │  │  │  ├─ (auth)/            # login, register/[step], forgot-password
│  │  │  │  │  ├─ (dashboard)/
│  │  │  │  │  │  ├─ layout.tsx      # glass sidebar + topbar, role-aware nav
│  │  │  │  │  │  ├─ marketplace/    # shared: search, [listingId], create, my-listings, favorites
│  │  │  │  │  │  ├─ messages/       # shared chat
│  │  │  │  │  │  ├─ notifications/
│  │  │  │  │  │  ├─ settings/
│  │  │  │  │  │  ├─ owner/          # dashboard, properties, units, tenants, rent, maintenance, subscription
│  │  │  │  │  │  ├─ tenant/         # dashboard, rental, rent, payments, maintenance, complaints, sos
│  │  │  │  │  │  ├─ user/           # general-user home, seller-plan
│  │  │  │  │  │  ├─ gov/            # dashboard, owners, tenants, properties, archive, people, quick-alert, complaints, incidents
│  │  │  │  │  │  └─ admin/          # dashboard, users, gov-admins, plans, pricing, payments, listings, analytics, audit, settings
│  │  │  │  │  └─ layout.tsx         # fonts, NextIntlClientProvider, theme
│  │  │  │  └─ api/v1/...             # route handlers (thin: parse → service → respond)
│  │  │  ├─ modules/                  # one folder per feature
│  │  │  │  ├─ auth/  ├─ users/  ├─ geo/  ├─ properties/  ├─ units/
│  │  │  │  ├─ tenancy/  ├─ rent/  ├─ maintenance/  ├─ complaints/
│  │  │  │  ├─ billing/  ├─ marketplace/  ├─ messaging/  ├─ notifications/
│  │  │  │  ├─ emergency/  ├─ gov/  ├─ admin/  ├─ audit/  └─ cms/
│  │  │  │      # each: schema.ts (Zod) · service.ts · repo.ts · actions.ts · components/ · hooks/ · __tests__/
│  │  │  ├─ components/
│  │  │  │  ├─ ui/                    # shadcn primitives restyled to glass
│  │  │  │  ├─ glass/                 # GlassCard, GlassInput, GradientTitle, StatusBadge, KpiCard, DataTable, Modal
│  │  │  │  ├─ layout/                # Sidebar, MobileDrawer, Topbar, LangSwitch, Logo (EN/BN)
│  │  │  │  └─ motion/                # FadeIn, Stagger, CountUp, AnimatedText (reduced-motion aware)
│  │  │  ├─ lib/
│  │  │  │  ├─ auth/                  # requireActor, session helpers, supabase clients
│  │  │  │  ├─ authz/                 # authorize, assertEntitlement, canCommunicate (re-export shared)
│  │  │  │  ├─ db.ts  ├─ redis.ts  ├─ storage.ts  ├─ payments/  ├─ sms/  ├─ email/
│  │  │  │  ├─ realtime-emit.ts  ├─ rate-limit.ts  ├─ audit.ts  └─ errors.ts
│  │  │  ├─ i18n/                     # routing.ts, request.ts
│  │  │  ├─ styles/globals.css        # tokens, .glass-card, .glass-input, gradient text
│  │  │  └─ middleware.ts             # locale + coarse role routing
│  │  ├─ messages/ { bn.json, en.json }
│  │  ├─ public/ brand/ { amaderghor-logo-EN.png, amaderghor-logo-BN.png, logo-icon.png, gov-admin.png }
│  │  └─ e2e/                         # Playwright
│  └─ realtime/                       # Node: Socket.IO server + BullMQ workers
│     └─ src/ { server.ts, auth.ts, rooms.ts, handlers/{chat,presence,sos,calls}.ts, jobs/{billing,rent,sos-escalation,notifications,outbox}.ts }
├─ packages/
│  ├─ db/                             # prisma/schema.prisma, migrations/, seed/ (geo, facilities, plans, admins)
│  ├─ shared/                         # roles.ts, permissions.ts, can-communicate.ts, enums, zod schemas shared by web + realtime
│  ├─ config/                         # eslint, tsconfig, tailwind preset (glass tokens)
│  └─ pdf/                            # invoice, receipt, incident report templates
├─ docker-compose.yml                 # postgres+postgis, redis, mailpit
└─ .github/workflows/ci.yml           # lint, typecheck, unit, prisma migrate check, e2e
```

## 11. Security, i18n, design system and non-functional requirements

### 11.1 Security

- **Authorization:** every handler calls `requireActor` + `authorize`; table-driven tests cover each role × permission pair from section 4.2.
- **PII:** NID stored AES-256-GCM encrypted (key in env/KMS) + SHA-256 hash for exact search; Gov/Admin lists show masked NID (`•••••••••1234`); full NID visible only on inspection with an audit entry.
- **Files:** private buckets, signed URLs (5 min), MIME sniffing + size limits (images 5 MB, docs 10 MB), EXIF stripped from images.
- **Rate limits (Redis):** login 5/15 min per IP+identifier, OTP 3/10 min per phone, SOS 5/hour, messages 20/10 s, people-search 30/min.
- **Payments:** activation only by Super Admin approval (phase 1) or verified IPN (phase 2); amounts recomputed server-side; TrxID unique across all requests; reviewer confirms amount and sender number; every approve/reject is audited; a Super Admin cannot approve a request on their own account.
- **Audit:** append-only `AuditLog` (DB grant without UPDATE/DELETE) for role/permission changes, moderation, pricing, refunds, payment verification, SOS transitions, PII views.
- **Transport and headers:** HTTPS only, HSTS, CSP (no inline scripts except Next nonce), CSRF protection on Server Actions (built in) and same-site cookies.
- **Secrets:** gateway and SMS keys only in server env or encrypted `PlatformSetting`; never in client bundles.
- **Outbox:** add an `OutboxEvent` table (type, payload, processedAt) for SOS fan-out, emails and SMS so side effects survive crashes.

### 11.2 Bangla / English

- next-intl with `/bn` and `/en` prefixes; default `bn`; preference saved on `User.locale` and cookie.
- Fonts via `next/font/google`: Poppins + Playfair Display (italic) for `en`, Anek Bangla for `bn`; `<html lang>` and a `data-locale` attribute switch the font stack and gradient-title style (Bangla titles use Anek Bangla SemiBold with the same gradient).
- Numbers, dates and currency through `Intl` with `bn-BD` / `en-BD` (Bangla digits in `bn`); `৳` prefix.
- Logo component swaps `amaderghor-logo-BN.png` / `-EN.png` by locale; `logo-icon.png` is favicon and Super Admin avatar.
- DB content that users see in both languages (zones, facilities, plans, CMS) stores `nameBn` + `nameEn`; user-generated text is stored as typed.
- CI check: every key in `en.json` exists in `bn.json`.

### 11.3 Design system implementation

- Tokens in `globals.css` as CSS variables (brand `#EC008C`, `#7B2FF7`, `#00AEEF`, navy `#0F172A`, four status tints) and exposed to Tailwind via `@theme`.
- Utility classes `.glass-card`, `.glass-input`, `.text-gradient-title`, `.btn-primary`, `.btn-glass`, `.btn-danger` exactly as the design spec; shadcn primitives restyled once in `components/ui`.
- Layout breakpoints: ≥1280 fixed 300 px sidebar; 768–1279 slim icon rail; <768 drawer + horizontally scrollable tables.
- Performance: `backdrop-filter` is costly on low-end Android, so a `@supports` fallback and a reduced-blur mode on small screens; Framer Motion limited to transform/opacity and disabled under `prefers-reduced-motion`.
- Accessibility: contrast ≥ 4.5:1 on glass (text on 65% white tested), focus rings (`#00AEEF` halo), keyboard-navigable modals, `aria-live` for toasts and SOS status.

### 11.4 Non-functional targets

| Area | Target |
| --- | --- |
| Marketplace search p95 | < 400 ms for 100k listings (GiST index on `location`, btree on price, zone, status) |
| SOS delivery to Gov hub | < 3 s p95 from tap to hub (socket path) |
| Public pages | LCP < 2.5 s on 4G, Lighthouse ≥ 90 |
| Availability | 99.5% monthly |
| Backups | daily DB backup, point-in-time recovery 7 days |
| Tests | services ≥ 80% line coverage; all permission and billing rules covered; e2e for each role's main flow |

## 12. Module development sequence

Build foundations and security first, then the paying customer's core (owner → tenant → rent), then billing, marketplace, communication and government oversight. Each module ships with its API, UI in both languages, validation, loading/empty/error states and tests before the next one starts.

**Phase 0 — Foundation**

1. **M01 Repo and tooling:** monorepo, TypeScript strict, ESLint/Prettier, docker-compose (Postgres+PostGIS, Redis), CI pipeline, env validation.
2. **M02 Design system:** tokens, glass components, gradient titles, buttons, inputs, table, modal, toast, KPI card, motion primitives; a `/dev/ui` showcase page.
3. **M03 i18n and app shell:** next-intl routing, fonts per locale, BN/EN logo, language pill, role-aware sidebar (desktop/tablet/mobile).
4. **M04 Database core:** Prisma schema for identity, geography, properties, units, tenancy, billing plans, audit; seed divisions/districts/upazilas/zones, plans, first Super Admin.
5. **M05 Auth and RBAC:** Supabase Auth, multi-step registration with OTP, login, forgot password, `requireActor`, `authorize`, `canCommunicate`, permission tests, audit logger.

**Phase 1 — Owner and tenant core**

6. **M06 Properties and units:** CRUD, images, map picker, archive (entitlement check stubbed until M09).
7. **M07 Tenancy:** invite tenant, accept invitation, assign unit, end tenancy, one-active-per-unit rule, previous tenants.
8. **M08 Rent:** monthly RentRecord job, record/verify payment, overview, reminders, receipts PDF, owner and tenant views.
9. **M09 Billing and subscriptions:** plans, quote, bKash upgrade modal, upgrade requests, Super Admin Pending Role Upgrades queue and approval, Owner ID, invoices, entitlement service, grace/expiry jobs, upgrade/downgrade, owner subscription page, Super Admin plan and pricing manager.
10. **M10 Dashboards:** Owner and Tenant dashboards with real aggregates.
11. **M11 Maintenance and complaints:** tickets with photos, status flow, comments, category stats.

**Phase 2 — Marketplace**

12. **M12 Marketplace browse:** listing model, PostGIS search, filters, facility distances, details page, favorites, saved searches, public pages (home, pricing, features).
13. **M13 Marketplace sell:** eligibility guard + toast, 5-step create form (land variant), drafts, My Listings, Seller Plan, reports.
14. **M14 Moderation and analytics:** approve/reject/suspend/feature, report queue, marketplace analytics.

**Phase 3 — Communication and safety**

15. **M15 Notifications:** in-app center, email/SMS providers, outbox worker, broadcasts.
16. **M16 Realtime messaging:** Socket.IO service, conversations, receipts, presence, support channel, listing inquiries.
17. **M17 Emergency SOS:** tenant/owner SOS, Gov Quick Alert hub, escalation jobs, incident reports.

**Phase 4 — Oversight and hardening**

18. **M18 Government Admin:** dashboard, owners/tenants/properties directories, archives, Find People.
19. **M19 Super Admin:** dashboard, user and Gov Admin management, payments/refunds, analytics, audit log viewer, platform settings.
20. **M20 Hardening:** security review, load test of search and SOS, accessibility audit, e2e suite per role, backup/restore drill, production deployment.
21. **M21 Phase 2 features:** LiveKit audio/video calls, payment gateway IPN (auto-activation), online tenant rent payment, listing promotion.

Suggested next step: start with M01–M02 (repo skeleton and glass design system), since every later module depends on them.
