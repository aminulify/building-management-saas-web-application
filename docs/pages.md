The updated AmaderGhor specification will treat Marketplace as a shared, role-based module, accessible from every dashboard, rather than a feature exclusive to the public website.

There will be two separate permissions:
1. Marketplace Browsing: All five roles can search, filter, view, and explore properties.
2. Marketplace Listing: Only accounts with the required listing entitlement can publish properties for rent or sale.
One important distinction: tenants will continue using ordinary rental services for free. Marketplace listing permission will be a separate entitlement, so a free tenant can still use the tenant dashboard without paying, but cannot publish a sale listing.
AmaderGhor – Detailed Page-by-Page Functional Specification
1. Global Marketplace and application rules
Marketplace access matrix
Role	Search	View Details	Create Listing	Manage Listings
Super Admin	Yes	Yes	Yes	All listings
Government Admin	Yes	Yes	No, unless authorized	Moderate/report
Apartment Owner	Yes	Yes	Paid plan required	Own listings
Tenant	Yes	Yes	Seller entitlement required	Own listings
General User	Yes	Yes	Seller entitlement required	Own listings

Listing subscription rules
- Free tenants can browse and view every public listing.
- Free tenants cannot publish apartments, flats, land, or other properties for sale.
- Free-tier owners cannot publish listings if their plan does not include Marketplace publishing.
- Eligible paid owners can publish within their subscription limits.
- Tenants and general users who want to sell properties must purchase an optional Marketplace Seller Plan.
- The normal tenant rental service remains free.
- Super Admin can configure listing permissions, subscription prices, listing limits, and expiry periods.
Create Listing restriction workflow:
1. User clicks Create Listing.
2. Backend checks the user's role, subscription, and listing entitlement.
3. If eligible, open the Create Listing form.
4. If not eligible, redirect to the Subscription / Marketplace Pricing page.
5. Display a toast message: Buy a subscription for listing your item.
6. If the user returns and clicks Create Listing again without upgrading, repeat the notification.
7. After successful payment and entitlement activation, allow access to the listing form.
The toast must appear on each restricted attempt, not continuously without user interaction.
2. Public website pages
Accessible to: All roles and visitors.
2.1 Homepage
Data fields
Field	Type	Source
Hero Title	Text	CMS
Hero Description	Textarea	CMS
Hero Image	Image	CMS
Features	JSON	CMS
Featured Properties	Reference[]	Marketplace
Pricing Preview	Reference[]	Subscription Plans
Testimonials	JSON	CMS

Buttons and actions
- Find Home: Opens Marketplace search.
- Explore Features: Opens Features page.
- View Pricing: Opens Pricing page.
- Login: Opens Login.
- Sign Up: Opens Role Selection.
- Language Switcher: Changes language globally.
- View Property: Opens Property Details.
Validation: Only published content and approved public listings can be displayed.
2.2 Features Page
Fields: Feature Title (Text), Description (Textarea), Icon (Text), Image (Image), Display Order (Number), Active Status (Boolean).

Source: CMS.

Actions:
- Explore: Opens feature details.
- Get Started: Opens registration.
- Login: Opens authentication.
Validation: Required title, description, and valid display order.
2.3 Pricing Page
Fields: Plan Name (Text), Plan Type (Dropdown), Monthly Price (Currency), Quarterly Discount (Number), Yearly Discount (Number), Property Limit (Number), Unit Limit (Number), Listing Limit (Number), Features (Multi-select), Status (Boolean).

Source: Subscription Plans database.

Actions:
- View Plan: Shows plan details.
- Select Plan: Starts checkout.
- Subscribe: Opens payment.
- Compare Plans: Shows plan comparison.
Validation:
- Price cannot be negative.
- Discount must be 0–100%.
- Limits must be valid.
- Inactive plans cannot be purchased.
- Tenant rental services must remain free.
2.4 Login Page
Fields: Email/Phone (Text), Password (Password), Remember Me (Boolean).

Actions:
- Login: Authenticates and redirects to the correct dashboard.
- Forgot Password: Opens recovery.
- Sign Up: Opens registration.
Source: Authentication API and Users database.

Validation: Required credentials, valid account, account not suspended, login rate limiting.
2.5 Registration Pages
Role Selection

Fields: Account Role (Dropdown: Owner, Tenant, General User).

Actions: Continue, Login.

Personal Information

Fields: Full Name (Text), Email (Email), Phone (Phone), Date of Birth (Date), Gender (Dropdown), Profile Photo (Image), NID Number (Text).

Actions: Continue, Back.

Address Information

Fields: Division (Dropdown), District (Dropdown), Upazila/Thana (Dropdown), Area (Text), Street Address (Text), Postal Code (Text).

Actions: Continue, Back.

Security Setup

Fields: Password (Password), Confirm Password (Password), Email OTP (Text), Phone OTP (Text).

Actions: Send OTP, Verify OTP, Complete Registration.

Document Verification

Fields: NID Front (File), NID Back (File), Additional Documents (File), Consent (Boolean).

Actions: Upload, Submit for Verification.

Source: Authentication Service, Users, Address Database, Document Storage.

Validation: Unique email and phone, password policy, matching passwords, valid OTP, supported document formats, size limits, and secure storage.

Super Admin and Government Admin accounts must be created through authorized administration, not public registration.
2.6 Forgot Password
Fields: Registered Email/Phone (Text), OTP (Text), New Password (Password), Confirm Password (Password).

Actions: Send OTP, Verify OTP, Reset Password.

Source: Authentication Service.

Validation: Valid account, unexpired OTP, secure password, rate-limited attempts.
2.7 About Us
Fields: Company Name (Text), Description (Textarea), Mission (Textarea), Vision (Textarea), Images (Image[]).

Actions: Contact Us, Get Started.

Source: CMS.

Validation: Required published content.
2.8 Contact Us
Fields: Full Name (Text), Email (Email), Phone (Phone), Subject (Text), Message (Textarea).

Actions: Submit Message, Reset.

Source: Contact Inquiries.

Validation: Valid email, supported phone format, required subject, message minimum length, spam protection.

3. Shared Marketplace Pages
These pages must appear in the navigation of all five role-based dashboards.
3.1 Marketplace Dashboard
Accessible roles: Super Admin, Government Admin, Apartment Owner, Tenant, General User.

Purpose: Provide one centralized place to discover available properties and manage relevant marketplace activities.

Data fields
Field	Type	Source
Total Properties	Number	Listings
Available for Rent	Number	Listings
Available for Sale	Number	Listings
Apartments	Number	Listings
Flats	Number	Listings
Land	Number	Listings
Featured Properties	Reference[]	Listings
Recent Listings	Reference[]	Listings
Popular Zones	Reference[]	Zones
User Favorites	Reference[]	Favorites

Buttons and actions
- Explore Marketplace: Opens Marketplace Search.
- Apartments: Applies apartment filter.
- Flats: Applies flat filter.
- Land: Applies land filter.
- For Rent: Applies rental filter.
- For Sale: Applies sale filter.
- Create Listing: Checks listing entitlement and opens the form or redirects to pricing.
- Saved Properties: Opens Favorites.
- View Details: Opens Property Details.
Validation:
- Only active, approved listings are included.
- Statistics must come from actual database records.
- Personal favorites must be restricted to their owner.
3.2 Marketplace Search and Filter Page
Accessible roles: All five roles.

Data fields
Field	Type	Validation
Search Keyword	Text	Maximum configured length
Listing Type	Dropdown	Rent / Sale
Property Category	Dropdown	Approved categories
Division	Dropdown	Valid division
District	Dropdown	Must match division
City	Dropdown	Must match district
Area/Zone	Dropdown	Valid zone
Minimum Price	Number	Cannot be negative
Maximum Price	Number	Must exceed minimum
Bedrooms	Dropdown	Valid count
Bathrooms	Dropdown	Valid count
Minimum Area	Number	Positive
Maximum Area	Number	Greater than minimum
Floor Number	Number	Valid integer
Furnishing	Dropdown	Furnished / Unfurnished
Security Features	Multi-select	Approved facilities
Nearby Mosque	Boolean	True/False
Nearby School	Boolean	True/False
Nearby College	Boolean	True/False
Nearby University	Boolean	True/False
Nearby Highway Road	Boolean	True/False
Nearby Playground	Boolean	True/False
Nearby Park	Boolean	True/False
Nearby Hospital	Boolean	True/False
Nearby Market	Boolean	True/False
Gated Community	Boolean	True/False
CCTV	Boolean	True/False
Security Guard	Boolean	True/False
Distance Radius	Number	Positive distance in km
Sort By	Dropdown	Price, newest, popularity, area

Buttons and actions
- Search: Fetches matching listings from the backend.
- Apply Filters: Applies selected filters.
- Reset: Clears all filters.
- View Map: Displays matching listings geographically.
- List View: Displays card results.
- Save Search: Stores the search for the authenticated user.
- Add to Favorites: Adds a property to the user's saved list.
- View Details: Opens Property Details.
- Create Listing: Checks entitlement before navigation.
Data source:
- Properties.
- Marketplace Listings.
- Geographic Zones.
- Property Facilities.
- Property Images.
- Favorites.
- Location Database.
Validation:
- Minimum price cannot exceed maximum price.
- Minimum area cannot exceed maximum area.
- District must belong to the selected division.
- Distance must be positive.
- Only approved facilities can be selected.
- Only published listings appear in results.
- Results must respect user privacy and listing visibility.
Location filtering logic: Nearby facilities should be calculated using verified property coordinates and facility coordinates, not merely the owner's manually entered descriptions. The system should support configurable proximity ranges.
3.3 Property Details Page
Accessible roles: All five roles.

Data fields
- Listing ID: UUID
- Property Title: Text
- Property Category: Dropdown
- Listing Type: Dropdown
- Description: Textarea
- Price: Currency
- Bedrooms: Number
- Bathrooms: Number
- Total Area: Number
- Floor Number: Number
- Total Floors: Number
- Address: Text
- Division: Dropdown
- District: Dropdown
- Zone: Dropdown
- GPS Latitude: Number
- GPS Longitude: Number
- Security Features: Multi-select
- Nearby Facilities: JSON
- Images: Image[]
- Owner/Seller Name: Text
- Listing Date: DateTime
- Verification Status: Status
- Availability Status: Status
Buttons and actions
- Contact Seller: Opens authorized communication workflow.
- Call Seller: Starts permitted call workflow.
- View on Map: Displays property location.
- Add to Favorites: Saves the listing.
- Share Listing: Generates shareable URL.
- Report Listing: Opens Report Listing form.
- Back to Search: Returns to filtered results.
Data source: Marketplace Listings, Properties, Owners, Facilities, Zones, Images.

Validation:
- Only published listings can be viewed publicly.
- Seller contact details must respect privacy.
- Listing must not be expired or suspended.
- Prices and property information must be valid.
3.4 Create Listing Page
Accessible roles:
- Super Admin: Yes.
- Apartment Owner: Only with eligible paid plan.
- Tenant: Only with Marketplace Seller entitlement.
- General User: Only with Marketplace Seller entitlement.
- Government Admin: No, unless separately authorized.
Step 1: Basic Information
Field	Type
Listing Title	Text
Listing Type	Dropdown: Rent / Sale
Property Category	Dropdown
Description	Textarea
Property Condition	Dropdown
Availability Date	Date

Step 2: Property Information
Field	Type
Total Area	Number
Area Unit	Dropdown: Sq Ft / Decimal / Katha
Bedrooms	Number
Bathrooms	Number
Floor Number	Number
Total Floors	Number
Furnishing Status	Dropdown
Parking Availability	Boolean
Property Images	Image[]
Video Tour	File / URL

For land listings, hide apartment-specific fields and show land-specific fields such as plot size, land classification, road access, and ownership documentation.

Step 3: Location
Field	Type
Division	Dropdown
District	Dropdown
Upazila/Thana	Dropdown
Area/Zone	Dropdown
Full Address	Text
Latitude	Number
Longitude	Number
Nearby Facilities	Multi-select

Step 4: Facilities and Safety
- Security Guard: Boolean
- CCTV: Boolean
- Gated Community: Boolean
- Nearby Mosque: Boolean
- Nearby School: Boolean
- Nearby College: Boolean
- Nearby University: Boolean
- Nearby Highway Road: Boolean
- Nearby Playground: Boolean
- Nearby Park: Boolean
- Nearby Hospital: Boolean
- Nearby Market: Boolean
Step 5: Price and Documents
- Selling Price: Currency
- Monthly Rent: Currency
- Negotiable: Boolean
- Ownership Document: File[]
- Additional Documents: File[]
- Declaration: Boolean
Buttons and actions
- Save Draft: Saves an unpublished draft.
- Preview Listing: Displays the listing preview.
- Submit for Approval: Sends listing for moderation.
- Cancel: Returns to Marketplace.
- Upload Images: Uploads property images.
- Select Location: Opens map selector.
Data source: Properties, Marketplace Listings, User Profiles, Facilities, Zones, Document Storage, Subscription Entitlements.

Validation:
- Listing title and description are required.
- Property category and listing type are required.
- Price must be positive.
- Area must be positive.
- Required location fields must be selected.
- Images must use supported formats and sizes.
- Ownership documents must satisfy configured requirements.
- Land listings must use land-specific validation.
- Seller must have listing entitlement.
- Subscription limits must not be exceeded.
- Duplicate active listings for the same property should be flagged for review.
3.5 Subscription Restriction Page
Accessible roles: All roles, when attempting to access restricted listing features.

Fields
- Current Account Role: Text
- Current Plan: Text
- Listing Permission: Boolean
- Listing Limit: Number
- Used Listing Count: Number
- Available Listing Count: Number
- Available Plans: Reference[]
Buttons and actions
- View Plans: Displays eligible subscription plans.
- Upgrade: Opens checkout.
- Purchase Seller Plan: Opens Marketplace Seller Plan checkout.
- Back to Marketplace: Returns to search.
Data source: Users, Subscriptions, Subscription Plans, Marketplace Entitlements.

Validation:
- Verify subscription on the backend.
- Never grant permission based only on frontend state.
- Activate listing access only after successful payment confirmation.
- Recalculate limits after upgrades and cancellations.
Required toast message:

"Buy a subscription for listing your item."

Display this toast each time an unauthorized user attempts to create a listing. After showing the toast, redirect to the appropriate subscription page.
3.6 My Listings Page
Accessible roles: Super Admin, Apartment Owner with entitlement, Tenant with seller entitlement, General User with seller entitlement.

Fields
- Listing ID: UUID
- Listing Title: Text
- Category: Dropdown
- Listing Type: Dropdown
- Price: Currency
- Created Date: DateTime
- Expiry Date: Date
- Approval Status: Status
- Availability Status: Status
- Views: Number
- Inquiries: Number
Buttons and actions
- View: Opens listing details.
- Edit: Opens edit form.
- Renew: Extends listing validity where permitted.
- Mark Sold: Changes listing status to Sold.
- Mark Rented: Changes listing status to Rented.
- Deactivate: Hides listing.
- Delete/Archive: Archives listing.
- Promote: Opens promotional plan options.
Data source: Marketplace Listings and Listing Analytics.

Validation:
- Users can modify only their own listings.
- Super Admin can manage all listings.
- Sold or rented listings cannot accept new inquiries as available properties.
- Edits to important fields may require reapproval.
3.7 Favorites Page
Accessible roles: All five roles.

Fields: Favorite ID (UUID), User ID (Reference), Listing ID (Reference), Saved Date (DateTime).

Buttons: Open Property, Remove Favorite, Contact Seller.

Source: Favorites and Marketplace Listings.

Validation: One favorite per user per listing; only public listings can be saved.
3.8 Report Listing Page
Accessible roles: All five roles.

Fields: Listing ID (Reference), Report Category (Dropdown), Description (Textarea), Evidence (File[]), Submitted Date (DateTime).

Buttons: Submit Report, Cancel.

Source: Listing Reports.

Validation: Category and description required; prevent excessive duplicate reports; restrict evidence access.
3.9 Marketplace Listing Management Page
Accessible role: Super Admin.

Fields: Listing ID (UUID), Seller (Reference), Property Category (Dropdown), Listing Type (Dropdown), Price (Currency), Verification Status (Status), Report Count (Number), Created Date (DateTime), Expiry Date (Date).

Buttons and actions
- Approve: Publishes listing.
- Reject: Rejects with reason.
- Suspend: Removes listing from public search.
- Restore: Reactivates eligible listing.
- Feature: Adds to featured listings.
- Remove Feature: Removes promotion.
- View Reports: Opens listing reports.
- View Seller: Opens seller details.
Data source: Marketplace Listings, Users, Listing Reports, Subscriptions.

Validation:
- Approval requires required listing information.
- Rejection requires a reason.
- Every moderation action must be logged.
- Only authorized administrators can change listing status.
3.10 Marketplace Analytics Page
Accessible role: Super Admin.

Fields: Total Listings (Number), Active Listings (Number), Sold Listings (Number), Rental Listings (Number), Listing Revenue (Currency), Seller Distribution (JSON), Popular Zones (JSON), Property Category Distribution (JSON), Report Statistics (JSON).

Buttons: Filter Date, Generate Report, Export CSV, Download PDF.

Source: Marketplace Listings, Transactions, Subscriptions, Listing Reports.

Validation: Date range must be valid; calculations must use actual records.

4. Apartment Owner Pages
Accessible role: Apartment Owner.
4.1 Owner Dashboard
Fields: Total Properties (Number), Total Units (Number), Occupied Units (Number), Vacant Units (Number), Total Tenants (Number), Monthly Revenue (Currency), Unpaid Rent (Currency), Collection Rate (Number), Maintenance Requests (Number), Recent Activities (JSON).

Buttons:
- Add Property: Opens property creation form.
- Add Unit: Opens unit creation form.
- View Properties: Opens Properties.
- View Tenants: Opens Tenants.
- View Rent: Opens Rent Overview.
- View Maintenance: Opens Maintenance.
- Marketplace: Opens shared Marketplace.
Source: Properties, Units, Rental Agreements, Payments, Maintenance.

Validation: Only authenticated owner's records; financial values must come from verified transactions.
4.2 Properties
Fields: Property Name (Text), Property Type (Dropdown), Address (Text), Division (Dropdown), District (Dropdown), Zone (Dropdown), Total Floors (Number), Total Units (Number), Images (Image[]), Status (Dropdown).

Buttons: Add Property, Edit, View Details, Archive, Add Unit.

Actions: Create or update property records, view details, archive eligible records, create associated units.

Source: Properties database.

Validation: Required name/address, positive floor/unit count, ownership authorization, valid image uploads.
4.3 Add/Edit Property
Fields: Name (Text), Description (Textarea), Type (Dropdown), Address (Text), Division (Dropdown), District (Dropdown), Zone (Dropdown), Floors (Number), Units (Number), Latitude (Number), Longitude (Number), Images (Image[]), Security (Multi-select), Nearby Facilities (Multi-select).

Buttons: Save, Upload Images, Select Location, Cancel.

Actions: Create/update property, upload media, select coordinates, discard changes.

Source: Properties, Zones, Facilities, Storage.

Validation: Required fields, valid coordinates, positive counts, valid image types, owner authorization.
4.4 Units
Fields: Unit Number (Text), Property (Dropdown), Floor (Number), Bedrooms (Number), Bathrooms (Number), Area (Number), Monthly Rent (Currency), Availability (Dropdown), Furnishing (Dropdown).

Buttons: Add Unit, Edit, View, Assign Tenant, Mark Available, Archive.

Actions: Manage individual units and tenant assignments.

Source: Units, Properties.

Validation: Unique unit number per property, valid rent and area, property ownership, no conflicting active tenancy.
4.5 Add/Edit Unit
Fields: Property (Reference), Unit Number (Text), Floor (Number), Bedrooms (Number), Bathrooms (Number), Area (Number), Rent (Currency), Deposit (Currency), Utility Charges (Currency), Description (Textarea), Availability (Dropdown).

Buttons: Save Unit, Cancel, Assign Tenant.

Source: Units and Properties.

Validation: Required property, unique unit number, non-negative amounts, valid occupancy status.
4.6 Tenants
Fields: Name (Text), Phone (Phone), Email (Email), Property (Reference), Unit (Reference), Rent (Currency), Start Date (Date), End Date (Date), Status (Dropdown).

Buttons: Add Tenant, Invite Tenant, View Details, Edit, Assign Unit, End Tenancy, Message.

Actions: Create invitation, link existing tenant, update tenancy, terminate tenancy, open conversation.

Source: Users, Tenant Profiles, Rental Agreements.

Validation: Valid contact details, available unit, valid tenancy dates, no overlapping active agreement.
4.7 Add Tenant
Fields: Name (Text), Email (Email), Phone (Phone), NID (Text), Property (Dropdown), Unit (Dropdown), Rent (Currency), Deposit (Currency), Start Date (Date), End Date (Date), Agreement (File).

Buttons: Invite Tenant, Assign Tenant, Upload Agreement, Save.

Source: Users, Properties, Units, Rental Agreements.

Validation: Valid email/phone, available unit, positive rent, valid dates, no duplicate user account.
4.8 Tenant Details
Fields: Tenant Profile (Reference), Contact (Text), Property (Reference), Unit (Reference), Rent (Currency), Agreement (Reference), Payment History (Reference[]), Maintenance History (Reference[]), Status (Status).

Buttons: Edit, Message, Call, View Payments, End Tenancy, Download Agreement.

Source: Tenant Profiles, Rental Agreements, Payments, Maintenance.

Validation: Owner-tenant relationship must be verified.
4.9 Rent Overview
Fields: Month (Dropdown), Year (Dropdown), Expected Rent (Currency), Collected Rent (Currency), Unpaid Rent (Currency), Overdue Rent (Currency), Tenant (Text), Unit (Text), Due Date (Date), Status (Dropdown).

Buttons: Filter, View Payment, Record Payment, Send Reminder, Export Report.

Source: Rent Records and Transactions.

Validation: Valid month/year, positive amounts, prevent duplicate payments, correct owner access.
4.10 Rent Collection
Fields: Tenant (Reference), Property (Reference), Unit (Reference), Billing Month (Date), Rent Amount (Currency), Paid Amount (Currency), Payment Method (Dropdown), Transaction Reference (Text), Payment Date (Date), Notes (Textarea).

Buttons: Record Payment, Verify Payment, Cancel, Download Receipt.

Source: Rent Records and Payments.

Validation: Active tenancy, positive payment, valid method, duplicate transaction protection.
4.11 Payment History
Fields: Transaction ID (UUID), Tenant (Reference), Amount (Currency), Method (Dropdown), Reference (Text), Date (DateTime), Status (Status).

Buttons: View Receipt, Download Receipt, Filter, Export CSV.

Source: Payment Transactions.

Validation: Owner can access only authorized transactions.
4.12 Previous Tenants
Fields: Tenant (Reference), Property (Reference), Unit (Reference), Previous Rent (Currency), Start Date (Date), End Date (Date), Settlement (Currency), Status (Status).

Buttons: View Details, Download Agreement, Payment History, Reassign Tenant.

Source: Archived Rental Agreements.

Validation: Only completed or terminated tenancy records.
4.13 Maintenance
Fields: Request ID (UUID), Tenant (Reference), Property (Reference), Unit (Reference), Category (Dropdown), Description (Textarea), Images (Image[]), Priority (Dropdown), Date (DateTime), Status (Status).

Buttons: View, Approve, Reject, Assign Technician, Update Status, Message Tenant, Complete.

Source: Maintenance Requests.

Validation: Required description/category, valid priority, owner authorization.
4.14 Subscriptions
Fields: Plan (Reference), Price (Currency), Billing Cycle (Dropdown), Start Date (Date), Expiry Date (Date), Status (Status), Property Limit (Number), Unit Limit (Number), Marketplace Listing Limit (Number).

Buttons: Upgrade, Downgrade, Renew, Cancel, View History, Download Invoice.

Source: Subscription Plans and User Subscriptions.

Validation: Active plan, successful payment, plan limits, billing rules.
4.15 Owner Messages
Fields: Conversation (Reference), Recipient (Reference), Message (Textarea), Attachments (File[]), Sent Date (DateTime), Read Status (Boolean).

Buttons: Send, Attach, Audio Call, Video Call, Search.

Source: Conversations and Messages.

Validation: Recipient must be an authorized tenant.
4.16 Owner Profile Settings
Fields: Name (Text), Email (Email), Phone (Phone), Photo (Image), Business Name (Text), Address (Text), Language (Dropdown), Notifications (JSON).

Buttons: Update Profile, Change Password, Update Language, Save Preferences.

Source: User and Owner Profiles.

Validation: Unique email/phone, valid image, secure password.

5. Tenant Pages
Accessible role: Tenant.
5.1 Tenant Dashboard
Fields: Tenant Name (Text), Property (Reference), Unit (Text), Rent (Currency), Next Due Date (Date), Outstanding Rent (Currency), Last Payment (Currency), Payment Status (Status), Maintenance Count (Number), Notifications (Number).

Buttons: My Rental, Monthly Rent, Payment History, Submit Maintenance, Contact Owner, Emergency Alert, Marketplace.

Actions: Navigate to relevant tenant services and shared Marketplace.

Source: Tenant Profile, Rental Agreements, Payments, Maintenance.

Validation: Only authenticated tenant's records.
5.2 My Rental
Fields: Property Name (Text), Address (Text), Unit Number (Text), Floor (Number), Bedrooms (Number), Bathrooms (Number), Rent (Currency), Deposit (Currency), Agreement Start (Date), Agreement End (Date), Owner (Reference).

Buttons: View Agreement, Download Agreement, Contact Owner, View Property.

Source: Rental Agreements, Properties, Units.

Validation: Current or historically authorized tenancy only.
5.3 Monthly Rent
Fields: Billing Month (Date), Rent (Currency), Utility Charges (Currency), Other Charges (Currency), Total (Currency), Due Date (Date), Paid (Currency), Outstanding (Currency), Status (Status).

Buttons: View Details, Pay Now (if enabled), Download Invoice, Contact Owner.

Source: Rent Records and Rental Agreements.

Validation: Tenant cannot change rent values; payment must be verified.
5.4 Payment History
Fields: Transaction ID (UUID), Billing Month (Date), Amount (Currency), Method (Dropdown), Reference (Text), Payment Date (DateTime), Status (Status).

Buttons: View Receipt, Download Receipt, Filter, Report Payment Issue.

Source: Payment Transactions.

Validation: Own transactions only.
5.5 Maintenance Requests
Fields: Issue Title (Text), Category (Dropdown), Description (Textarea), Images (Image[]), Priority (Dropdown), Submission Date (DateTime), Status (Status).

Buttons: Submit, View, Cancel Pending Request, Add Comment, Contact Owner.

Source: Maintenance Requests.

Validation: Required title/description, valid category, active tenancy, secure attachments.
5.6 Submit Complaint
Fields: Category (Dropdown), Subject (Text), Description (Textarea), Evidence (File[]), Property (Reference), Submission Date (DateTime).

Buttons: Submit Complaint, Upload Evidence, Track Complaint, Cancel.

Source: Complaints.

Validation: Required subject and description, valid evidence, authenticated ownership.
5.7 Tenant Messages
Fields: Owner (Reference), Conversation ID (UUID), Message (Textarea), Attachment (File[]), Timestamp (DateTime).

Buttons: Send, Attach, Audio Call, Video Call.

Source: Conversations and Messages.

Validation: Only assigned owner communication.
5.8 Emergency Alert
Fields: Emergency Type (Dropdown), Description (Textarea), GPS Location (Location), Latitude (Number), Longitude (Number), Contact (Phone), Submitted At (DateTime), Status (Status).

Buttons: Police Alert, Fire Service Alert, Confirm, Cancel Before Submission.

Source: Emergency Alerts and Location Services.

Validation: Required emergency type, valid location or manual address, duplicate prevention, secure submission. Show the distinction between platform receipt and actual police receipt.
5.9 Tenant Profile Settings
Fields: Name (Text), Email (Email), Phone (Phone), Photo (Image), Language (Dropdown), Notification Preferences (JSON).

Buttons: Update, Change Password, Change Language, Save Preferences.

Source: Users and Tenant Profiles.

Validation: Unique contact details, valid images, secure password.

6. Government Admin Pages
Accessible role: Government Admin.
6.1 Government Dashboard
Fields: Registered Owners (Number), Registered Tenants (Number), Verified Properties (Number), Pending Complaints (Number), Emergency Alerts (Number), Active Incidents (Number), Resolved Incidents (Number), Recent Activities (JSON).

Buttons: Owners, Tenants, Properties, Emergency Alerts, Complaints, Reports, Marketplace.

Actions: Open monitoring pages and shared Marketplace.

Source: Users, Properties, Complaints, Emergency Alerts.

Validation: Authorized records only.
6.2 Registered Owners
Fields: Owner ID (UUID), Name (Text), Phone (Phone), Email (Email), NID Status (Status), Property Count (Number), Registration Date (Date), Account Status (Status).

Buttons: Search, Filter, View, Message, View Properties.

Source: Users and Owner Profiles.

Validation: Government Admin can only view authorized information.
6.3 Registered Tenants
Fields: Tenant ID (UUID), Name (Text), Phone (Phone), Email (Email), Property (Reference), Unit (Reference), Owner (Reference), Verification Status (Status), Registration Date (Date).

Buttons: Search, Filter, View Tenant, Message, View Property.

Source: Tenant Profiles and Rental Agreements.

Validation: Protect personal and financial information.
6.4 Property Monitoring
Fields: Property ID (UUID), Property Name (Text), Owner (Reference), Address (Text), Zone (Reference), Type (Dropdown), Verification Status (Status), Property Status (Status).

Buttons: View, View Owner, Review Verification, Report Issue.

Source: Properties.

Validation: No unauthorized ownership changes.
6.5 Emergency Alerts
Fields: Alert ID (UUID), Reporter (Reference), Phone (Phone), Emergency Type (Dropdown), Description (Textarea), GPS (Location), Address (Text), Submission Time (DateTime), Priority (Dropdown), Status (Status), Assigned Officer (Reference).

Buttons: View, Acknowledge, Assign Officer, Forward to Police, Update Status, Add Notes, Resolve.

Source: Emergency Alerts and Incident Reports.

Validation: Unique ID, valid coordinates, authorized status transitions, forwarding confirmation, audit logs.
6.6 Police Alert Details
Fields: Incident ID (UUID), Reporter (Reference), Category (Dropdown), Description (Textarea), Location (Location), Reported Time (DateTime), Assigned Officer (Reference), Forwarding Method (Dropdown), Forwarding Reference (Text), Response Status (Status), Resolution Notes (Textarea).

Buttons: Forward Emergency, Assign Officer, Update Incident, Add Notes, Resolve, Download Report.

Source: Emergency Alerts and Incident Reports.

Validation: Required details, verified forwarding result, valid status transitions.
6.7 Complaints
Fields: Complaint ID (UUID), Reporter (Reference), Category (Dropdown), Subject (Text), Description (Textarea), Evidence (File[]), Date (DateTime), Assigned Officer (Reference), Status (Status).

Buttons: View, Assign, Investigate, Add Notes, Update Status, Close.

Source: Complaints.

Validation: Unique complaint, authorized evidence access, logged changes.
6.8 Incident Reports
Fields: Incident ID (UUID), Incident Type (Dropdown), Related Alert (Reference), Location (Location), Date (DateTime), Officer (Reference), Findings (Textarea), Resolution (Textarea), Status (Status).

Buttons: Create, Edit, Submit, Download PDF, Close.

Source: Incident Reports and Emergency Alerts.

Validation: Valid related alert, required findings, preserved history.
6.9 Government Admin Messages
Fields: Recipient (Reference), Subject (Text), Message (Textarea), Attachment (File[]), Sent Date (DateTime).

Buttons: Send, Attach File, Start Authorized Call, View History.

Source: Conversations and Messages.

Validation: Only Owners, Tenants, and Super Admin are valid recipients.
6.10 Government Admin Profile Settings
Fields: Name (Text), Email (Email), Phone (Phone), Department (Text), Designation (Text), Language (Dropdown), Notification Settings (JSON).

Buttons: Update Profile, Change Password, Update Language.

Source: Government Admin Profiles.

Validation: Valid contact details and authorized profile changes.

7. Super Admin Pages
Accessible role: Super Admin.
7.1 Super Admin Dashboard
Fields: Total Users (Number), Owners (Number), Tenants (Number), Government Admins (Number), Properties (Number), Active Subscriptions (Number), Monthly Revenue (Currency), Transactions (Number), Pending Verifications (Number), Emergency Alerts (Number), Marketplace Listings (Number), Recent Activities (JSON).

Buttons: Manage Users, Owners, Tenants, Government Admins, Properties, Subscriptions, Payments, Emergency Monitoring, Marketplace, Analytics.

Source: All authorized platform databases.

Validation: Accurate aggregation, financial transaction verification.
7.2 User Management
Fields: User ID (UUID), Name (Text), Email (Email), Phone (Phone), Role (Dropdown), Registration Date (Date), Verification Status (Status), Account Status (Status).

Buttons: Create, View, Edit, Suspend, Activate, Assign Role, Archive.

Source: Users and Roles.

Validation: Unique contacts, valid roles, protect last active Super Admin, audit permission changes.
7.3 Owner Management
Fields: Owner ID (UUID), Name (Text), Email (Email), Phone (Phone), Property Count (Number), Subscription (Reference), Verification Status (Status), Account Status (Status).

Buttons: View, Edit, Verify, Suspend, Properties, Subscription.

Source: Users and Owner Profiles.

Validation: Correct role, preserve financial records.
7.4 Tenant Management
Fields: Tenant ID (UUID), Name (Text), Email (Email), Phone (Phone), Owner (Reference), Property (Reference), Unit (Reference), Verification Status (Status), Account Status (Status).

Buttons: View, Edit, Verify, Suspend, Rental History.

Source: Tenant Profiles and Rental Agreements.

Validation: Correct rental relationships, preserve history.
7.5 Government Admin Management
Fields: Admin ID (UUID), Name (Text), Email (Email), Phone (Phone), Department (Text), Designation (Text), Permissions (Multi-select), Status (Status).

Buttons: Create, Edit, Assign Permissions, Activate, Suspend, View Logs.

Source: Government Admin Profiles and Roles.

Validation: Authorized account creation, unique email, permission checks, audit logging.
7.6 Property Management
Fields: Property ID (UUID), Name (Text), Owner (Reference), Address (Text), Zone (Reference), Listing Type (Dropdown), Status (Status), Verification Status (Status), Created Date (Date).

Buttons: View, Edit, Approve, Reject, Suspend, Archive.

Source: Properties and Marketplace Listings.

Validation: Existing owner, complete information, logged moderation.
7.7 Property Verification
Fields: Property ID (UUID), Owner (Reference), Documents (File[]), Address (Text), Verification Status (Status), Reviewer Notes (Textarea), Review Date (Date).

Buttons: Approve, Reject, Request Documents, View Documents.

Source: Verification Documents and Properties.

Validation: Required documents, authorized reviewer, rejection reason, audit record.
7.8 Subscription Management
Fields: Plan ID (UUID), Plan Name (Text), Plan Type (Dropdown), Monthly Price (Currency), Quarterly Discount (Number), Yearly Discount (Number), Property Limit (Number), Unit Limit (Number), Listing Limit (Number), Features (Multi-select), Active (Boolean).

Buttons: Create Plan, Edit Plan, Activate, Deactivate, Delete Unused Plan, Preview.

Source: Subscription Plans.

Validation: Unique name, valid price, discount 0–100%, valid limits, historical billing preservation.
7.9 Pricing Management
Fields: Plan (Reference), Billing Cycle (Dropdown), Base Price (Currency), Discount (Number), Final Price (Currency), Effective Date (Date), Status (Boolean).

Buttons: Update Price, Set Discount, Schedule Change, Preview.

Source: Subscription Plans and Pricing History.

Validation: Server-side price calculations, valid discount, historical invoice preservation.
7.10 Payment Management
Fields: Transaction ID (UUID), User (Reference), Subscription (Reference), Amount (Currency), Method (Dropdown), Gateway Reference (Text), Payment Date (DateTime), Status (Status), Refund Amount (Currency).

Buttons: View, Verify, Refund, Download Invoice, Export.

Source: Payment Transactions and Gateway.

Validation: Unique transaction, trusted payment confirmation, eligible refund, audit records.
7.11 Emergency Monitoring
Fields: Alert ID (UUID), Reporter (Reference), Type (Dropdown), Location (Location), Submission Time (DateTime), Government Admin (Reference), Status (Status), Response Time (Number).

Buttons: View, Notify Government Admin, Escalate, View Incident, View History.

Source: Emergency Alerts.

Validation: Preserve emergency records, authorized access, logged updates.
7.12 Complaints Management
Fields: Complaint ID (UUID), Reporter (Reference), Category (Dropdown), Subject (Text), Description (Textarea), Assigned Admin (Reference), Status (Status), Resolution (Textarea).

Buttons: View, Assign, Update, Resolve, Reopen.

Source: Complaints.

Validation: Authorized assignment, required resolution, complete history.
7.13 Analytics and Reports
Fields: Date Range (Date Range), User Growth (JSON), Property Growth (JSON), Revenue (Currency), Subscription Distribution (JSON), Rent Activity (JSON), Emergency Statistics (JSON), Marketplace Statistics (JSON).

Buttons: Apply Filters, Generate, Export CSV, Download PDF.

Source: Aggregated platform records.

Validation: Valid dates, verified transactions, permission-controlled exports.
7.14 Audit Logs
Fields: Log ID (UUID), User (Reference), Role (Dropdown), Action (Text), Resource Type (Text), Resource ID (UUID), IP Address (Text), Timestamp (DateTime), Previous Value (JSON), New Value (JSON).

Buttons: Search, Filter, View Details, Export.

Source: Audit Logs.

Validation: Append-only logs, no ordinary editing, sensitive-data protection.
7.15 Platform Settings
Fields: Platform Name (Text), Logo (Image), Default Language (Dropdown), Supported Languages (Multi-select), Currency (Dropdown), Timezone (Dropdown), Email Settings (JSON), Payment Gateway (JSON), Notification Settings (JSON), Emergency Integration (JSON), Marketplace Configuration (JSON).

Buttons: Save, Upload Logo, Test Email, Test Payment, Configure Emergency Integration, Configure Marketplace.

Source: Platform Configuration.

Validation: Valid configuration, encrypted secrets, no API credentials in frontend.
7.16 Super Admin Messages
Fields: Recipient (Reference), Subject (Text), Message (Textarea), Attachment (File[]), Sent Date (DateTime).

Buttons: Send Message, Attach File, Start Audio Call, Start Video Call, View History.

Source: Conversations and Messages.

Validation: All user roles are permitted recipients; secure file uploads and message authorization.
7.17 Super Admin Profile Settings
Fields: Name (Text), Email (Email), Phone (Phone), Photo (Image), Language (Dropdown), Notification Settings (JSON).

Buttons: Update Profile, Change Password, Update Language.

Source: Users and Super Admin Profile.

Validation: Unique contact information, secure authentication.

8. Shared Communication Pages
8.1 Conversation List
Access:
- Super Admin: Everyone.
- Government Admin: Owners, Tenants, Super Admin.
- Owner: Assigned Tenants.
- Tenant: Assigned Owner.
- General User: No private dashboard conversations unless a permitted marketplace inquiry is initiated.
Fields: Conversation ID (UUID), Participants (Reference[]), Last Message (Text), Last Message Time (DateTime), Unread Count (Number), Status (Status).

Buttons: Open, Search, Archive, Start Call.

Actions: Open authorized conversations, search conversation history, archive where permitted, initiate calls.

Source: Conversations and Messages.

Validation: Verify all participants and communication permissions.
8.2 Chat Window
Fields: Message ID (UUID), Sender (Reference), Recipient (Reference), Text (Textarea), Attachment (File[]), Sent Time (DateTime), Read Time (DateTime), Status (Status).

Buttons: Send, Attach File, Delete for Self, Audio Call, Video Call.

Source: Messages and Conversations.

Validation: Message or attachment required, file restrictions, participant authorization.
8.3 Audio/Video Call
Fields: Call ID (UUID), Caller (Reference), Receiver (Reference), Type (Dropdown), Start Time (DateTime), End Time (DateTime), Status (Status), Duration (Number).

Buttons: Call, Accept, Reject, Mute, Unmute, Camera On/Off, End Call.

Source: Real-time Communication Service.

Validation: Calling permissions, camera/microphone permission, secure connection, call metadata logging.

9. Shared Notification Pages
Notification Center
Accessible roles: All five roles.

Fields: Notification ID (UUID), User ID (Reference), Title (Text), Description (Textarea), Type (Dropdown), Related Record (Reference), Read Status (Boolean), Created At (DateTime).

Buttons:
- Open Notification: Opens related page.
- Mark as Read: Updates read status.
- Mark All as Read: Updates all notifications.
- Archive: Archives notification.
Source: Notifications Service.

Validation: Deliver only to authorized users; prevent duplicate notifications where possible; preserve important emergency and financial notifications.

10. Global Navigation Structure
Every role should have a Marketplace entry in its dashboard navigation.
Role	Main Navigation
Super Admin	Dashboard, Users, Owners, Tenants, Government Admins, Properties, Marketplace, Subscriptions, Payments, Emergency Monitoring, Complaints, Messages, Reports, Settings
Government Admin	Dashboard, Owners, Tenants, Property Monitoring, Marketplace, Emergency Alerts, Complaints, Incident Reports, Messages, Reports, Settings
Apartment Owner	Dashboard, Properties, Units, Tenants, Rent Overview, Marketplace, Maintenance, Messages, Subscriptions, Notifications, Settings
Tenant	Dashboard, My Rental, Monthly Rent, Payment History, Marketplace, Maintenance, Messages, Emergency Alert, Notifications, Settings
General User	Home, Marketplace, Favorites, My Listings (if entitled), Messages (where permitted), Profile, Settings


11. Database Modules and Relationships
The following modules must support the complete application.
Database Module	Purpose
Users	All accounts
Roles	Role permissions
Owner Profiles	Owner information
Tenant Profiles	Tenant information
Government Admin Profiles	Government admin information
Properties	Property records
Units	Apartment units
Rental Agreements	Owner-tenant relationships
Rent Records	Monthly rent obligations
Payment Transactions	Financial records
Subscription Plans	Pricing and features
User Subscriptions	Subscription history
Marketplace Listings	Sale and rental listings
Marketplace Entitlements	Listing permissions
Listing Images	Property media
Listing Documents	Ownership documents
Property Facilities	Nearby amenities
Zones	Geographic areas
Favorites	Saved listings
Listing Reports	Reported listings
Listing Analytics	Views and inquiries
Maintenance Requests	Repairs
Complaints	User complaints
Conversations	Chat relationships
Messages	Chat history
Calls	Call metadata
Notifications	Alerts
Emergency Alerts	Emergency incidents
Incident Reports	Government response
Verification Documents	NID and property documents
Audit Logs	Administrative history

Important relationships
- One owner can own multiple properties.
- One property can have multiple units.
- One unit can have multiple historical rental agreements.
- One unit can have only one active tenancy.
- One listing belongs to one seller and one property.
- One listing can have multiple images and documents.
- One listing can have multiple favorites and reports.
- One owner can have multiple subscription records but only one applicable active owner plan.
- One tenant can have free rental access and a separate Marketplace Seller entitlement.
- One listing can have multiple inquiries.
- One emergency alert can have multiple incident records.

12. Global Validation and Security Requirements
All forms must use frontend and backend validation.
Category	Rules
Text	Required fields, maximum length
Email	Valid format and uniqueness where required
Phone	Valid Bangladesh mobile format
Password	Strong password policy
Currency	Non-negative, valid decimal precision
Date	Valid date and logical range
Dropdown	Must match predefined options
Multi-select	Only approved options
File	Supported formats and size limits
Image	Valid image formats
Location	Valid GPS or manual address
Reference	Related record must exist
Subscription	Valid entitlement
Permission	Backend authorization required
Status	Valid state transitions

Bangladesh defaults
- Currency: BDT (৳)
- Timezone: Asia/Dhaka
- Language: English and Bengali
- English Font: Poppins
- Bengali Font: Anek Bangla
Security requirements
- Role-Based Access Control.
- Secure password hashing.
- OTP verification.
- Secure file uploads.
- API authentication.
- Rate limiting.
- Audit logging.
- Private data access restrictions.
- Secure payment verification.
- Emergency alert access controls.
- Subscription entitlement verification.

13. Final Development Acceptance Criteria
Every page must meet these requirements before it is considered complete:
1. The page must follow the approved Figma design.
2. All required fields must exist with correct data types.
3. All buttons must trigger their documented actions.
4. All forms must connect to the correct backend APIs.
5. Data must come from the database, not hardcoded mock records.
6. All validation must work on the frontend and backend.
7. Role permissions must be enforced.
8. Loading, empty, success, and error states must exist.
9. Marketplace permissions must be checked server-side.
10. Restricted listing attempts must redirect to pricing and show the specified toast.
11. English and Bengali must work throughout the application.
12. Glassmorphism components must remain visually consistent.
13. Desktop, tablet, and mobile layouts must be tested.
14. Emergency alerts must be delivered to the Government Admin system.
15. All important financial and administrative operations must be auditable.
Final Goal: Build AmaderGhor as a fully functional, bilingual, responsive property management and real estate SaaS platform. All five roles must have their own permissions and dashboards, while Marketplace remains a shared discovery platform for apartments, flats, units, land, and other properties available for rent or sale.

14. Some attachment
- I have attached 4 sample which is out saas web application template and color style i need more modern and গ্লাসমরফিজম style. such: sample1.jpg , sample2.jpg , sample3.jpg , sample4.jpg
- Also i have attached this web application logo design. if language english then show everywhere: amaderghor-logo-EN.png
- Also i have attached this web application logo design. if language bangla then show everywhere: amaderghor-logo-BN.png
- Also i have attached this web application logo icon it will use for favicon and super-admin profile image: logo-icon.png
- Also i have attached this web application government-admin profile image: government-admin-profile-image.png
- Also i have attached this web application homepage design overview but i need more modern stylist and গ্লাসমরফিজম style and animated motion graphics motion text use your design intelligence get idea from this image: Homepage.png