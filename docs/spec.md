# 🏢 AMADERGHOR SaaS: Master Project Specification Prompt

You are an expert SaaS Architect and Lead Engineer. Your task is to implement the complete master project specification for **"AmaderGhor"**, a comprehensive property management and real estate marketplace SaaS platform. The application uses a **Glassmorphism Design System** (translucent frosted cards, ambient soft shadows, dynamic dual-language switching with Poppins & Playfair Display italic for English, and Anek Bangla for Bengali).

---

## 👥 1. USER ROLES & CAPABILITIES

1. **Super Admin:** Global system owner.
   - **Can See/Do:** Complete system metrics, platform revenue, user management across all roles, listing moderation, global broadcast notices, direct VoIP/messaging to any user, and full management of subscription plans, pricing, property/unit limits, and feature toggles.
2. **Government Admin (`Bangladesh Govt`):** Official regulatory entity.
   - **Can See/Do:** Audit-level oversight of active/archived properties, active/archived owners, and active/archived tenants; live monitoring of the Emergency SOS Response Hub; messaging to Landlords, Tenants, and Super Admin; universal identity search via 13-digit NID, phone, or email.
3. **Landlord (Apartment Owner):** Registered property manager.
   - **Can See/Do:** Manage multi-unit real estate portfolios (Rental & Buy/Sell listings); track tenant lease agreements and rent clearance ledgers; manage maintenance tickets; select and pay for monthly/quarterly/yearly subscription plans (Primary, Millionaire, Billionaire); chat/call active tenants.
4. **Tenant (Active Resident):** Verified occupant.
   - **Can See/Do:** View active tenancy details and monthly rent balance; pay rent via digital payment channels; submit maintenance tickets with photos; trigger 1-tap Emergency SOS alerts to Government Admin; chat/call landlord.
5. **General User / Free Tenant (Property Seeker):** Non-paying user.
   - **Can See/Do:** Search public marketplace for rental flats or properties for sale 100% free; apply zone-based location and amenity filters (Security, Mosque, School, etc.); view detailed property modals. Cannot upload listings for sale/rent without upgrading to an owner subscription.

---

## 💳 2. APARTMENT OWNER SUBSCRIPTION & BILLING SYSTEM

### **A. Core Subscription Access Policy**
- **Apartment Owners:** **Must purchase a paid subscription** to manage properties, units, tenants, and post marketplace listings.
- **Tenants & General Users:** **100% FREE.** Zero subscription fees, zero listing view charges, zero hidden fees.

---

### **B. Monthly Pricing & Plan Limits Matrix**

| Features | Primary | Millionaire | Billionaire |
| :--- | :---: | :---: | :---: |
| **Monthly Price** | **৳159** | **৳299** | **৳699** |
| **Properties Limit** | 1–2 Properties | 2–4 Properties | 4–12 Properties |
| **Units Limit** | 1–40 Units | 41–160 Units | 161–500 Units |
| **Rent Tracking** | Basic | Advanced | Super |
| **Maintenance** | Basic Requests | Advanced Management | Smart Management |
| **Tenant Messaging** | Yes | Yes | Yes |
| **Property Management** | Yes | Yes | Yes |
| **Rent Analytics** | Basic | Advanced | Advanced |
| **Tenant Management** | Yes | Yes | Yes |

---

### **C. Billing Options & Automated Discounts**
Discounts are calculated automatically from the applicable monthly subscription price:
- **Monthly Billing:** 0% Discount (Standard price per month).
- **Quarterly Billing (3 Months):** **10% Discount** off total quarterly calculation.
- **Yearly Billing (12 Months):** **20% Discount** off total annual calculation.

---

### **D. Mandatory Subscription Lifecycle Workflows**
The system backend and frontend must support:
1. **Subscription Activation:** Immediate unlocking of plan-specific limits upon verified gateway payment.
2. **Subscription Renewal:** Automated renewal triggers and manual extension flows before expiry dates.
3. **Plan Upgrades & Downgrades:** Pro-rated calculation when transitioning between Primary, Millionaire, and Billionaire tiers.
4. **Payment History:** Detailed receipt history, downloadable PDF invoices, and transaction logs.
5. **Expiry Notifications:** Automated in-app toast warnings, email alerts, and SMS notifications prior to plan expiration.
6. **Subscription Status Tracking:** Real-time account state badges (`Active`, `Grace Period`, `Expired`, `Cancelled`).
7. **Payment Failure Handling:** Grace period enforcement (e.g., 3-day window), automated payment retry logic, and soft-locking listing permissions upon non-payment.

---

### **E. Super Admin Plan Management Controls**
Super Admins have full administrative authority over the billing engine to dynamically:
- Update monthly base pricing (৳159, ৳299, ৳699) and discount percentages.
- Adjust property limits (e.g., 1–2, 2–4, 4–12) and unit caps (e.g., 40, 160, 500).
- Toggle specific feature flags (Basic/Advanced Rent Analytics, Smart Maintenance, etc.) across tiers.

---

### **F. Free User Listing Enforcement Guard**
If a free tenant or non-subscribed user attempts to click **"Create Listing"**, the system blocks the action, navigates directly to the Subscription Pricing page, and displays a persistent toast notification: 
> *"Buy a subscription for listing your item."*

---

## 📄 3. COMPLETE PAGE MATRIX BY ROLE

| Page Name | Target Role(s) | Primary Purpose & Content |
| :--- | :--- | :--- |
| **Marketplace / Find Home** | All Roles (Public / Seekers) | Dual Rental & Buy/Sell search, zone selector, amenity filter matrix, property detail inspection modal. |
| **Tenant Dashboard** | Active Tenant | Active tenancy summary, monthly rent due badge, pay rent trigger, 1-tap SOS emergency button. |
| **Owner Dashboard** | Landlord | Managed portfolio overview, revenue metrics, unit occupancy rates, add property modal. |
| **Manage Find Home** | Gov Admin, Super Admin | Regulatory moderation page to approve, flag, or reject rental and buy/sell listings. |
| **Active Maintenance** | All Roles (Role View) | Maintenance ticketing system with 100% normalized category charts and resolution progress tracking. |
| **Active Owners** | Gov Admin, Super Admin | Verified landlord directory categorized by subscription tiers (Primary, Millionaire, Billionaire). |
| **Active Tenants** | Gov Admin, Super Admin | Directory of active residents, occupancy percentage, expiring lease alerts, and tenant inspection modals. |
| **Subscription & Billing** | Landlord, Super Admin | Billing options (Monthly/Quarterly/Yearly), tier plan selection, payment gateway integration, invoice history. |
| **Support Inbox / Message** | All Roles (Role Restricted) | Real-time chat, pinned Support Center thread, read receipts (`✓`/`✓✓`), and VoIP calling. |
| **Previous Properties** | Gov Admin, Super Admin | Archive of deactivated, suspended, inactive, and deleted properties with dynamic reason/status filters. |
| **Previous Owners** | Gov Admin, Super Admin | Archive of deactivated, banned, inactive, and deleted property owners with landlord inspection modals. |
| **Previous Tenants** | Gov Admin, Super Admin | Archive of moved-out tenants, average tenancy stats (e.g., 1.8 Yrs), and rent clearance logs. |
| **Find People** | Gov Admin, Super Admin | Universal search engine using 13-digit BD NID, full email, phone number, or Account ID. |
| **Quick Alert ●** | Gov Admin | Live Emergency SOS Response Hub monitoring Fire, Security, and Leakage incidents. |
| **Super Admin Dashboard** | Super Admin | Master platform revenue analytics, subscription configuration engine, user management, and broadcast notices. |

---

## 🔀 4. PAGE NAVIGATION FLOW

[ Public Landing Page / Marketplace ]
│
├──> [ General User: Search Listings & Filter Amenities ]
│      └─ (Click 'Create Listing' -> Redirect to Subscription Page + Toast: "Buy a subscription for listing your item.")
│
└──> [ Auth Gate / Login ]
│
├──> [ Tenant Portal ] ──────> Dashboard ──> Pay Rent / SOS Trigger ──> Maintenance ──> Chat
│
├──> [ Landlord Portal ] ────> Dashboard ──> My Properties ──> Subscription & Billing ──> Maintenance ──> Chat
│
├──> [ Super Admin Portal ] ──> Master Revenue ──> Plan & Price Manager ──> User Management ──> Support Inbox
│
└──> [ Gov Admin Portal ] ───> Properties ──> Active Owners/Tenants ──> Archives ──> Quick Alert (SOS Hub)


---

## 💬 5. MESSAGE & VOIP CALLING PERMISSIONS MATRIX

Communication between users is governed by strict role-based routing rules:

| Sender Role | Can Message / Call Active Tenant? | Can Message / Call Landlord? | Can Message / Call Super Admin? | Can Message / Call Gov Admin? |
| :--- | :---: | :---: | :---: | :---: |
| **Active Tenant** | ❌ No | ✅ Yes (Direct) | ✅ Yes (Support Channel) | ❌ No |
| **Landlord** | ✅ Yes (Direct) | ❌ No | ✅ Yes (Support Channel) | ❌ No |
| **Super Admin** | ✅ Yes (Any) | ✅ Yes (Any) | ✅ Yes (Internal) | ✅ Yes (Direct) |
| **Gov Admin** | ✅ Yes (Inspection) | ✅ Yes (Inspection) | ✅ Yes (Support Channel) | ✅ Yes (Internal) |

- **Chat Features:** Real-time text messaging, online/offline status indicators (`● Online` / `● Offline`), read receipts (`✓` Sent, `✓✓` Green Seen), pinned Support Center channel, and VoIP voice/video calling.

---

## 🚨 6. EMERGENCY POLICE & SOS ALERT ROUTING

1. **Trigger:** A tenant or landlord taps the red **1-Tap Emergency SOS** button on their dashboard.
2. **Payload Capture:** The system captures the user's verified identity (Name, NID, Phone), exact building location (Address, Floor, Unit Number), hazard type (Fire, Theft, Leakage), and GPS coordinates.
3. **Routing to Gov Admin:** The alert instantly routes to the **Government Admin Quick Alert Hub** (`Quick Alert ●`) with a loud alert sound and pulsating red indicator.
4. **Action Lifecycle:**
   - Appears in the Live Alert Feed marked **UNSOLVED** (Red Badge).
   - Gov Admin updates state dropdown: `Need Action` $\rightarrow$ `Processing` $\rightarrow$ `Solved Request`.
   - Direct 1-click dispatch buttons link to national emergency services (Police 999, Fire Brigade, Ambulance).
   - Marking as "Solved Request" converts the alert to **SOLVED** (Green) and logs it in municipal safety archives.

---

## 🔍 7. BUY/SELL MARKETPLACE & ZONE-BASED SEARCH RULES

- **Dual Mode Toggle:** Marketplace allows switching between **Rental Homes** and **Buy/Sell Properties** (Flats, Apartments, Buildings, Land).
- **Zone Navigation:** Search by Division, District, or specific Neighborhood Zones (e.g., *Mirpur DOHS, Uttara Sector 4, Dhanmondi, Bashundhara R/A, Keraniganj*).
- **Amenity Filters:** Multi-select filtering based on nearby facilities:
  - 🛡️ **Security:** Gated compound, CCTV, 24/7 security guard.
  - 🅿️ **Parking:** Dedicated car and motorcycle parking.
  - 🕌 **Mosque:** Proximity to local mosques.
  - 🏫 **School / College / University:** Proximity to educational institutions.
  - 🛣️ **Highway Road:** Direct access to main arterial roads.
  - 🛝 **Playground / Park:** Nearby green spaces and children's parks.