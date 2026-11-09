# AmaderGhor REST API

Base URL: `http://localhost:3000` (dev). All JSON. Send `Authorization: Bearer <access token>` unless marked public.

Success: `{ "data": ... }`. Error: `{ "code", "message" (i18n key), "details" }`. Lists use `?cursor=&limit=` and return `{ items, nextCursor }`.

## :...rest

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/:...rest` | Unknown /api/v1 paths answer with the same JSON error shape as every other endpoint, not an HTML 404 page. |
| POST | `/api/v1/:...rest` | Unknown /api/v1 paths answer with the same JSON error shape as every other endpoint, not an HTML 404 page. |
| PUT | `/api/v1/:...rest` | Unknown /api/v1 paths answer with the same JSON error shape as every other endpoint, not an HTML 404 page. |
| PATCH | `/api/v1/:...rest` | Unknown /api/v1 paths answer with the same JSON error shape as every other endpoint, not an HTML 404 page. |
| DELETE | `/api/v1/:...rest` | Unknown /api/v1 paths answer with the same JSON error shape as every other endpoint, not an HTML 404 page. |

## admin

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/admin/alerts` |  |
| POST | `/api/v1/admin/alerts/:id/escalate` |  |
| GET | `/api/v1/admin/analytics` |  |
| GET | `/api/v1/admin/analytics/export` |  |
| GET | `/api/v1/admin/archive/:kind` | Previous Properties / Owners / Tenants. |
| GET | `/api/v1/admin/audit-logs` | Super Admin: all entries. Gov Admin: only their own actions. |
| GET | `/api/v1/admin/audit-logs/export` |  |
| GET | `/api/v1/admin/broadcasts` |  |
| POST | `/api/v1/admin/broadcasts` |  |
| PUT | `/api/v1/admin/cms/:key` |  |
| GET | `/api/v1/admin/contact-inquiries` |  |
| GET | `/api/v1/admin/listings` |  |
| POST | `/api/v1/admin/listings/:id/:action` | POST /admin/listings/:id/{approve|reject|suspend|restore|feature|unfeature|flag}. Gov Admin: flag only. |
| GET | `/api/v1/admin/listings/:id/reports` |  |
| GET | `/api/v1/admin/marketplace/analytics` |  |
| GET | `/api/v1/admin/owners` |  |
| GET | `/api/v1/admin/payments` |  |
| POST | `/api/v1/admin/payments/:id/refund` |  |
| GET | `/api/v1/admin/payments/export` |  |
| GET | `/api/v1/admin/plans` |  |
| POST | `/api/v1/admin/plans` |  |
| PATCH | `/api/v1/admin/plans/:id` | Only plans that were never subscribed to can be deleted; otherwise deactivate. |
| DELETE | `/api/v1/admin/plans/:id` | Only plans that were never subscribed to can be deleted; otherwise deactivate. |
| POST | `/api/v1/admin/plans/:id/activate` |  |
| POST | `/api/v1/admin/plans/:id/deactivate` |  |
| GET | `/api/v1/admin/plans/:id/schedule-price` |  |
| POST | `/api/v1/admin/plans/:id/schedule-price` |  |
| GET | `/api/v1/admin/properties` |  |
| GET | `/api/v1/admin/properties/:id` | Property verification screen: details + documents with short-lived signed URLs. |
| POST | `/api/v1/admin/properties/:id/:action` | POST /admin/properties/:id/{verify|reject|request-docs|suspend|restore} |
| GET | `/api/v1/admin/settings` | Secrets are returned masked; they can only be replaced, never read back. |
| PATCH | `/api/v1/admin/settings` | Secrets are returned masked; they can only be replaced, never read back. |
| POST | `/api/v1/admin/settings/:test` | POST /admin/settings/{test-email|test-payment} |
| GET | `/api/v1/admin/tenants` |  |
| GET | `/api/v1/admin/upgrade-requests` |  |
| POST | `/api/v1/admin/upgrade-requests/:id/approve` |  |
| POST | `/api/v1/admin/upgrade-requests/:id/reject` |  |
| GET | `/api/v1/admin/users` |  |
| POST | `/api/v1/admin/users` |  |
| GET | `/api/v1/admin/users/:id` | User detail incl. the NID, for manual verification. Super Admin only; each view is audited. |
| PATCH | `/api/v1/admin/users/:id` | User detail incl. the NID, for manual verification. Super Admin only; each view is audited. |
| POST | `/api/v1/admin/users/:id/:action` | POST /admin/users/:id/{suspend|activate|role|verify} |
| GET | `/api/v1/admin/users/:id/permissions` | Grant/revoke permission overrides for a Gov Admin (e.g. listing:create). |
| POST | `/api/v1/admin/users/:id/permissions` | Grant/revoke permission overrides for a Gov Admin (e.g. listing:create). |

## auth

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/auth/availability` |  |
| POST | `/api/v1/auth/login` |  |
| POST | `/api/v1/auth/logout` |  |
| POST | `/api/v1/auth/oauth/complete` | After Google: creates the free account on first use, or returns the existing one. Bearer = Supabase access token. |
| GET | `/api/v1/auth/oauth/google/url` | Returns the Supabase URL that starts Google sign-in. `redirectTo` must be this site's /bn|en/auth/callback. |
| POST | `/api/v1/auth/otp/send` |  |
| POST | `/api/v1/auth/otp/verify` |  |
| POST | `/api/v1/auth/password/change` |  |
| POST | `/api/v1/auth/password/forgot` |  |
| POST | `/api/v1/auth/password/reset` |  |
| GET | `/api/v1/auth/providers` | Public: which social sign-ins are switched on (the sign-in page greys out Google when it is not). |
| POST | `/api/v1/auth/refresh` | "Stay logged in": trade a refresh token for a fresh access token. |
| POST | `/api/v1/auth/register` |  |
| POST | `/api/v1/auth/register/uploads` | Public: signed upload URL for NID front/back and profile photo during sign-up. |

## call-requests

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/call-requests` | "Call later": schedule a callback with the other person in a conversation. |
| POST | `/api/v1/call-requests` | "Call later": schedule a callback with the other person in a conversation. |
| POST | `/api/v1/call-requests/:id/:action` | POST /call-requests/:id/{accept|decline|cancel|done} |

## cms

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/cms/:key` | Public CMS block: homepage hero, features, about, testimonials… |

## complaints

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/complaints` |  |
| POST | `/api/v1/complaints` |  |
| GET | `/api/v1/complaints/:id` |  |
| POST | `/api/v1/complaints/:id/:action` | POST /complaints/:id/{assign|status|notes|resolve|reopen} |

## contact

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/contact` |  |

## conversations

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/conversations` | Checks canCommunicate (role matrix + active agreement) before opening. |
| POST | `/api/v1/conversations` | Checks canCommunicate (role matrix + active agreement) before opening. |
| POST | `/api/v1/conversations/:id/archive` |  |
| GET | `/api/v1/conversations/:id/messages` |  |
| POST | `/api/v1/conversations/:id/messages` |  |
| POST | `/api/v1/conversations/:id/messages/:messageId/delete` | Delete for self. |
| POST | `/api/v1/conversations/:id/read` |  |

## dashboard

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/dashboard/admin` |  |
| GET | `/api/v1/dashboard/gov` |  |
| GET | `/api/v1/dashboard/owner` |  |
| GET | `/api/v1/dashboard/tenant` |  |
| GET | `/api/v1/dashboard/user` | Free (general user) account dashboard. |

## files

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/files/signed` | 5-minute read link for your own upload (Super Admin: any). |

## geo

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/geo/districts` |  |
| GET | `/api/v1/geo/divisions` |  |
| GET | `/api/v1/geo/facilities` | Public: nearby-facility points for the map (mosque, school, hospital…). |
| GET | `/api/v1/geo/upazilas` |  |
| GET | `/api/v1/geo/zones` |  |

## gov

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/gov/alerts` | Quick Alert hub feed. Clients also poll this every 15 s with ?since= as a socket backstop. |
| GET | `/api/v1/gov/alerts/:id` |  |
| POST | `/api/v1/gov/alerts/:id/:action` | POST /gov/alerts/:id/{ack|assign|forward|status|notes} |
| GET | `/api/v1/gov/archive/:kind` |  |
| GET | `/api/v1/gov/incidents` |  |
| POST | `/api/v1/gov/incidents` |  |
| GET | `/api/v1/gov/owners` | Registered Owners (masked NID, no financial data). |
| GET | `/api/v1/gov/people/search` | Find People by NID, phone, email or account id (rate-limited, audited, NID masked). |
| GET | `/api/v1/gov/properties` |  |
| POST | `/api/v1/gov/properties/:id/report` | Gov Admin "Report Issue" on a property: notifies Super Admins, changes nothing. |
| GET | `/api/v1/gov/tenants` |  |

## health

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/health` |  |

## internal

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/internal/cron/rent` | Scheduler (Vercel Cron / worker) → POST with header x-cron-secret. Idempotent. |
| POST | `/api/v1/internal/cron/storage` | Daily: removes abandoned sign-up uploads (private ID photos must not linger). Header: x-cron-secret. |
| POST | `/api/v1/internal/cron/subscriptions` |  |

## invitations

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/invitations/:token/accept` |  |

## invoices

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/invoices/:id` | Invoice data (the PDF renderer consumes this). Owner of the payment or Super Admin. |

## listings

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/listings` | Public: zone/amenity/price filtered search for rental and buy/sell listings. |
| POST | `/api/v1/listings` | Public: zone/amenity/price filtered search for rental and buy/sell listings. |
| GET | `/api/v1/listings/:id` |  |
| PATCH | `/api/v1/listings/:id` |  |
| POST | `/api/v1/listings/:id/:action` | POST /listings/:id/{renew|mark-sold|mark-rented|deactivate|archive} (seller only) |
| POST | `/api/v1/listings/:id/documents` | Ownership / additional documents (private; only moderators see them). |
| POST | `/api/v1/listings/:id/images` |  |
| POST | `/api/v1/listings/:id/inquiries` |  |
| POST | `/api/v1/listings/:id/reports` |  |
| POST | `/api/v1/listings/:id/submit` |  |
| POST | `/api/v1/listings/:id/view` |  |
| GET | `/api/v1/listings/eligibility` | "Create Listing" guard. 403 LISTING_ENTITLEMENT_REQUIRED → client goes to /pricing?reason=listing and shows the toast. |
| GET | `/api/v1/listings/stats` | Marketplace dashboard counters: totals, rent/sale, apartments/flats/land, featured, recent, popular zones. |

## maintenance

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/maintenance` |  |
| POST | `/api/v1/maintenance` |  |
| GET | `/api/v1/maintenance/:id` |  |
| POST | `/api/v1/maintenance/:id/:action` | POST /maintenance/:id/{approve|reject|assign|status|complete|cancel} |
| POST | `/api/v1/maintenance/:id/comments` |  |
| GET | `/api/v1/maintenance/stats` |  |

## me

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/me` |  |
| PATCH | `/api/v1/me` |  |
| GET | `/api/v1/me/documents` | Register an uploaded NID front/back (or other) document for verification. |
| POST | `/api/v1/me/documents` | Register an uploaded NID front/back (or other) document for verification. |
| GET | `/api/v1/me/favorites` |  |
| PUT | `/api/v1/me/favorites/:listingId` |  |
| DELETE | `/api/v1/me/favorites/:listingId` |  |
| GET | `/api/v1/me/listings` |  |
| GET | `/api/v1/me/payments` |  |
| GET | `/api/v1/me/saved-searches` |  |
| POST | `/api/v1/me/saved-searches` |  |
| DELETE | `/api/v1/me/saved-searches/:id` |  |
| GET | `/api/v1/me/subscription` |  |

## notifications

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/notifications` |  |
| POST | `/api/v1/notifications/:id/:action` | POST /notifications/:id/{read|archive} |
| POST | `/api/v1/notifications/read-all` |  |

## plans

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/plans` | Public. Prices for every cycle are computed on the server. |

## presence

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/presence` | POST = heartbeat ("I'm online"), GET ?userIds=a,b = online/offline + lastSeenAt. |
| GET | `/api/v1/presence` | POST = heartbeat ("I'm online"), GET ?userIds=a,b = online/offline + lastSeenAt. |

## properties

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/properties` |  |
| POST | `/api/v1/properties` |  |
| GET | `/api/v1/properties/:id` |  |
| PATCH | `/api/v1/properties/:id` |  |
| POST | `/api/v1/properties/:id/archive` |  |
| POST | `/api/v1/properties/:id/documents` | Owner attaches an ownership document; the property moves to verification PENDING. |
| GET | `/api/v1/properties/:id/floors` |  |
| POST | `/api/v1/properties/:id/images` |  |
| GET | `/api/v1/properties/:id/units` |  |
| POST | `/api/v1/properties/:id/units` |  |

## rent

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/rent/export` |  |
| GET | `/api/v1/rent/overview` |  |
| GET | `/api/v1/rent/payments` | Owner Payment History. |
| GET | `/api/v1/rent/payments/:id/receipt` |  |
| POST | `/api/v1/rent/payments/:id/verify` | Owner confirms (or rejects) a payment that was recorded as unverified. |
| GET | `/api/v1/rent/records` |  |
| PATCH | `/api/v1/rent/records/:id` |  |
| POST | `/api/v1/rent/records/:id/payments` |  |
| POST | `/api/v1/rent/records/:id/remind` |  |

## settings

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/settings/payment-info` | The bKash number is read from PlatformSetting, never hard-coded. Signed-in users only. |

## sos

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/sos` | Owner or Tenant raises an SOS; it is routed straight to the Government Admin hub. |
| GET | `/api/v1/sos/mine` |  |

## subscriptions

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/subscriptions/:id/cancel` |  |
| GET | `/api/v1/subscriptions/fee-estimate` | Public calculator: how much is the monthly landlord fee for N properties? |
| POST | `/api/v1/subscriptions/quote` |  |

## tenancies

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/tenancies` |  |
| GET | `/api/v1/tenancies/:id` |  |
| PATCH | `/api/v1/tenancies/:id` |  |
| GET | `/api/v1/tenancies/:id/agreement` | Signed 5-minute download link for the agreement (owner, tenant, Super Admin). |
| POST | `/api/v1/tenancies/:id/agreement` | Signed 5-minute download link for the agreement (owner, tenant, Super Admin). |
| POST | `/api/v1/tenancies/:id/end` |  |
| POST | `/api/v1/tenancies/invite` |  |

## tenant

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/tenant/payments` | Tenant Payment History (own payments only). |
| GET | `/api/v1/tenant/rent` |  |
| GET | `/api/v1/tenant/rental` | Tenant "My Rental" page. |

## units

| Method | URL | Notes |
| --- | --- | --- |
| GET | `/api/v1/units/:id` |  |
| PATCH | `/api/v1/units/:id` |  |
| POST | `/api/v1/units/:id/:action` | POST /units/:id/{archive|mark-available} |

## upgrade-requests

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/upgrade-requests` |  |
| POST | `/api/v1/upgrade-requests/:id/cancel` |  |
| GET | `/api/v1/upgrade-requests/mine` |  |

## uploads

| Method | URL | Notes |
| --- | --- | --- |
| POST | `/api/v1/uploads/sign` | Returns a one-time signed upload URL for a private bucket. Type and size limits are enforced here. |

---
Total: 187 endpoints in 156 route files.
