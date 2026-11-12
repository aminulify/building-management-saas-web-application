/**
 * Removes the seeded DEMO accounts and everything that belongs to them, so only real data stays.
 *
 *   npm run clean:demo            (dry run: only counts what would be removed)
 *   npm run clean:demo -- --yes   (really removes it, cannot be undone)
 *
 * A demo account is a user whose e-mail ends with @example.com and who is not a Super Admin or Government Admin.
 * Real accounts, and the temporary accounts of the e2e test (@mailinator.com), are never touched.
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const db = new PrismaClient();
const yes = process.argv.includes("--yes");

async function main() {
  const demo = await db.user.findMany({
    where: { email: { endsWith: "@example.com", mode: "insensitive" }, role: { notIn: ["SUPER_ADMIN", "GOV_ADMIN"] } },
    select: { id: true, authId: true, fullName: true, role: true },
  });
  const ids = demo.map((u) => u.id);
  if (ids.length === 0) { console.log("No demo accounts found. Nothing to do."); return; }

  const convs = (await db.conversationParticipant.findMany({ where: { userId: { in: ids } }, select: { conversationId: true } })).map((c) => c.conversationId);
  const listings = (await db.listing.findMany({ where: { sellerId: { in: ids } }, select: { id: true } })).map((l) => l.id);
  const props = await db.property.findMany({ where: { ownerId: { in: ids } }, select: { id: true, addressId: true } });
  const propIds = props.map((p) => p.id);
  const agreements = (await db.rentalAgreement.findMany({ where: { OR: [{ ownerId: { in: ids } }, { tenantId: { in: ids } }] }, select: { id: true } })).map((a) => a.id);
  const alerts = (await db.emergencyAlert.findMany({ where: { reporterId: { in: ids } }, select: { id: true } })).map((a) => a.id);
  const addrIds = (await db.user.findMany({ where: { id: { in: ids } }, select: { addressId: true } })).map((u) => u.addressId).filter(Boolean) as string[];

  const byRole: Record<string, number> = {};
  for (const u of demo) byRole[u.role] = (byRole[u.role] ?? 0) + 1;
  console.log(`Demo accounts: ${demo.length}`, byRole);
  console.log(`Their data: ${props.length} properties, ${agreements.length} leases, ${listings.length} listings, ${convs.length} conversations`);
  if (!yes) { console.log("\nDry run only. Add --yes to remove it for good."); return; }

  const steps: [string, () => Promise<unknown>][] = [
    ["notifications", () => db.notification.deleteMany({ where: { userId: { in: ids } } })],
    ["audit", () => db.auditLog.deleteMany({ where: { actorId: { in: ids } } })],
    ["call requests", () => db.callRequest.deleteMany({ where: { OR: [{ conversationId: { in: convs } }, { requesterId: { in: ids } }] } })],
    ["live calls", () => db.call.deleteMany({ where: { OR: [{ conversationId: { in: convs } }, { callerId: { in: ids } }, { calleeId: { in: ids } }] } })],
    ["messages", () => db.message.deleteMany({ where: { conversationId: { in: convs } } })],
    ["participants", () => db.conversationParticipant.deleteMany({ where: { conversationId: { in: convs } } })],
    ["conversations", () => db.conversation.deleteMany({ where: { id: { in: convs } } })],
    ["favorites", () => db.favorite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { listingId: { in: listings } }] } })],
    ["saved searches", () => db.savedSearch.deleteMany({ where: { userId: { in: ids } } })],
    ["visit requests", () => db.visitRequest.deleteMany({ where: { OR: [{ listingId: { in: listings } }, { requesterId: { in: ids } }, { sellerId: { in: ids } }] } })],
    ["boosts", () => db.listingBoost.deleteMany({ where: { OR: [{ userId: { in: ids } }, { listingId: { in: listings } }] } })],
    ["listing children", async () => {
      await db.listingReport.deleteMany({ where: { OR: [{ listingId: { in: listings } }, { reporterId: { in: ids } }] } });
      await db.listingStatDaily.deleteMany({ where: { listingId: { in: listings } } });
      await db.listingImage.deleteMany({ where: { listingId: { in: listings } } });
      await db.listingDocument.deleteMany({ where: { listingId: { in: listings } } });
      await db.listingFacilityDistance.deleteMany({ where: { listingId: { in: listings } } });
    }],
    ["listings", () => db.listing.deleteMany({ where: { id: { in: listings } } })],
    ["incidents", () => db.incidentReport.deleteMany({ where: { OR: [{ officerId: { in: ids } }, { alertId: { in: alerts } }] } })],
    ["alert events", () => db.emergencyAlertEvent.deleteMany({ where: { alertId: { in: alerts } } })],
    ["alerts", () => db.emergencyAlert.deleteMany({ where: { id: { in: alerts } } })],
    ["complaints", async () => {
      const c = (await db.complaint.findMany({ where: { reporterId: { in: ids } }, select: { id: true } })).map((x) => x.id);
      await db.complaintEvent.deleteMany({ where: { complaintId: { in: c } } });
      await db.complaint.deleteMany({ where: { id: { in: c } } });
    }],
    ["maintenance", async () => {
      const m = (await db.maintenanceRequest.findMany({ where: { OR: [{ agreementId: { in: agreements } }, { tenantId: { in: ids } }] }, select: { id: true } })).map((x) => x.id);
      await db.maintenanceComment.deleteMany({ where: { requestId: { in: m } } });
      await db.maintenanceImage.deleteMany({ where: { requestId: { in: m } } });
      await db.maintenanceRequest.deleteMany({ where: { id: { in: m } } });
    }],
    ["rent", async () => {
      const r = (await db.rentRecord.findMany({ where: { agreementId: { in: agreements } }, select: { id: true } })).map((x) => x.id);
      await db.rentPayment.deleteMany({ where: { rentRecordId: { in: r } } });
      await db.rentRecord.deleteMany({ where: { id: { in: r } } });
    }],
    ["invitations", () => db.tenantInvitation.deleteMany({ where: { ownerId: { in: ids } } })],
    ["agreements", () => db.rentalAgreement.deleteMany({ where: { id: { in: agreements } } })],
    ["units/properties", async () => {
      await db.unit.deleteMany({ where: { propertyId: { in: propIds } } });
      await db.propertyImage.deleteMany({ where: { propertyId: { in: propIds } } });
      await db.property.deleteMany({ where: { id: { in: propIds } } });
      await db.address.deleteMany({ where: { id: { in: props.map((p) => p.addressId).filter(Boolean) as string[] } } });
    }],
    ["billing", async () => {
      await db.invoice.deleteMany({ where: { transaction: { userId: { in: ids } } } });
      await db.paymentTransaction.deleteMany({ where: { userId: { in: ids } } });
      await db.upgradeRequest.deleteMany({ where: { userId: { in: ids } } });
      await db.userSubscription.deleteMany({ where: { userId: { in: ids } } });
    }],
    ["profiles", async () => {
      await db.ownerProfile.deleteMany({ where: { userId: { in: ids } } });
      await db.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
      await db.userPermissionOverride.deleteMany({ where: { userId: { in: ids } } });
    }],
    ["documents", () => db.verificationDocument.deleteMany({ where: { OR: [{ ownerType: "USER", ownerId: { in: ids } }, { ownerType: "PROPERTY", ownerId: { in: propIds } }] } })],
    ["account logs", () => db.accountStatusLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { adminId: { in: ids } }] } })],
    ["users", () => db.user.deleteMany({ where: { id: { in: ids } } })],
    ["addresses", () => db.address.deleteMany({ where: { id: { in: addrIds } } })],
  ];

  for (const [name, fn] of steps) {
    try { const out = (await fn()) as { count?: number } | undefined; console.log(`  ok   ${name}${out && typeof out.count === "number" ? ` (${out.count})` : ""}`); }
    catch (e) { console.log(`  FAIL ${name}:`, String((e as Error).message).split("\n").pop()); process.exitCode = 1; }
  }

  // the sign-in records of the demo accounts
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    let gone = 0;
    for (const u of demo) if (u.authId) { const { error } = await sb.auth.admin.deleteUser(u.authId); if (!error) gone++; }
    console.log(`  ok   sign-in records (${gone})`);
  }
  console.log(`\nLeft: ${await db.user.count()} accounts.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
