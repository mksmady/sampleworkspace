# Maddybaba – Liferay Objects Data Model

Source of truth for all Liferay Objects, picklists, relationships, permissions and automation.
Design reference: `docs/Homepage — desktop.pdf`. Search design: `docs/search.md`.

Maddybaba is built around the **local host**: a traveler finds one person at their destination who can arrange the whole trip (stay, transport, food, tours, activities) or offer a single experience. Hosts don't need to own a hotel or vehicle; they can offer their own services, connect guests with local services, guide, plan complete trips or manage everything for a guest.

## 0. Conventions

- Every picklist, object definition, field and relationship has an **external reference code (ERC)** prefixed `MB_`.
- Object names: PascalCase singular (`Listing`). Field names: camelCase (`basePrice`). Field ERC = `MB_<Object>_<field>` (`MB_Host_handle`). Field labels are the name split into words (`hostRole` → Host Role).
- `status` is reserved by Liferay (it's the workflow status), so status picklists are named `<object>Status` (`bookingStatus`).
- Objects appear in the Control Panel under Objects. Comments and categorization are off. No field is localized (this Liferay version keeps `enableLocalization` on for every object and ignores attempts to turn it off).
- Picklist item keys: camelCase (`localTripHost`); names are the display labels.
- Picklist names are the ERC without `MB_`, split into words (`MB_HostRole` → Host Role). Picklist item ERC = `<picklist ERC>_<key>` (`MB_HostRole_localTripHost`).
- Labels are `en-US` only for now.
- Currency is INR. Money fields use **PrecisionDecimal**.
- Scope: all objects are **company-scoped**.
- Field types below use Liferay `businessType` names: `Text`, `LongText`, `RichText`, `Integer`, `LongInteger`, `PrecisionDecimal`, `Boolean`, `Date`, `DateTime`, `Picklist`, `MultiselectPicklist`, `Attachment`, `Aggregation`, `Formula`, `AutoIncrement`, `Relationship`.
- `R` = required. `U` = unique values. Every plain field is indexed (search.md filters, boosts and sorts on non-text fields). `S` = searchable: `Text`/`LongText`/`RichText` fields marked S are indexed as analyzed full text (`en-US`); other text fields are indexed as keywords.
- Attachment fields accept `jpg, jpeg, png, webp` up to 5 MB, uploaded from the user's device, unless noted otherwise.
- `DateTime` fields store in UTC (`timeStorage = convertToUTC`).
- REST paths are generated from the object name, pluralized and lowercased (`/o/c/<name>s`), not from the plural label: Destination is `/o/c/destinations`. Verify the actual path in `/o/api` after publishing.
- **Derived fields** (stored copies of related or computed values) are written only by `mb-actions-service` (section 7). Any value a client sends for them is overwritten.

## 1. Build order

Dependencies force this order:

1. Picklists (section 2)
2. Object definitions with plain fields only. Publish each one (section 3)
3. Relationships (section 4)
4. Aggregation, formula and auto-increment fields (they depend on relationships)
5. Validations (section 5)
6. Account restriction, roles and permissions (section 6)
7. Object actions and scheduled jobs (section 7)
8. Seed data (section 9)

On the local instance, steps 1–7 are applied by the setup scripts (`scripts/setup/`). On any other instance, the data model (steps 1–5 and the object actions of step 7, including the relationships from the User and Account system objects and account restriction) is installed by the **`mb-objects-batch` client extension** (phase 9), generated from the local instance by `scripts/setup/export-objects-batch.js`. Roles and permissions, the approval workflow and the instance settings (section 6) are not batch-importable and are applied with `roles.js`, `workflows.js` and the Instance Settings UI; see `client-extensions/mb-objects-batch/README.md` for the install order.

The data files in `scripts/setup/data/` are brought in line with this spec in the phase that uses them (picklists in phase 1, objects in phase 2, …).

Some field types and features (AutoIncrement, Formula, aggregation filters, account restriction) depend on the Liferay version. Check the version in CLAUDE.md and flag anything unsupported instead of silently skipping it.

## 2. Picklists

| ERC | Items (key → label) |
|---|---|
| `MB_ServiceCategory` | stay → Stay, homestay → Homestay, transport → Transport, food → Local Food, tours → Tours, activities → Activities, experiences → Experiences, trekking → Trekking, camping → Camping, rafting → Rafting, paragliding → Paragliding, shikara → Shikara, photography → Photography, localGuide → Local Guide, completeTrip → Complete Trip |
| `MB_HostRole` | localTripHost → Local Trip Host, experienceHost → Local Experience Host, adventureHost → Adventure Host |
| `MB_HostOffer` | ownServices → Offering Own Services, connectServices → Connecting Guests with Local Services, guiding → Guiding Travelers, planTrips → Planning Complete Trips, fullTrip → Managing Everything for a Guest |
| `MB_HostApplicationType` | signUp → Sign-up, profileEdit → Profile Edit |
| `MB_ApplicationStatus` | submitted → Submitted, applied → Applied, rejected → Rejected |
| `MB_HostStatus` | pendingVerification → Pending Verification, active → Active, suspended → Suspended |
| `MB_PartnerType` | hotel → Hotel, resort → Resort, homestay → Homestay, camp → Camp, houseboat → Houseboat, activityOperator → Activity Operator, transport → Transport, restaurant → Restaurant |
| `MB_PartnershipStatus` | active → Active, paused → Paused, ended → Ended |
| `MB_PriceUnit` | perPerson → Per Person, perNight → Per Night, perRoom → Per Room, perGroup → Per Group, perTrip → Per Trip |
| `MB_InclusionType` | included → Included, addOn → Add-on |
| `MB_SlotStatus` | open → Open, full → Full, closed → Closed |
| `MB_PackageStatus` | draft → Draft, quoted → Quoted, booked → Booked, abandoned → Abandoned |
| `MB_BookingStatus` | pendingPayment → Pending Payment, confirmed → Confirmed, completed → Completed, cancelled → Cancelled, refunded → Refunded |
| `MB_BookingSource` | web → Web, app → App, hostLink → Host Link |
| `MB_PaymentMethod` | upi → UPI, card → Credit / Debit Card, netBanking → Net Banking |
| `MB_PaymentStatus` | initiated → Initiated, success → Success, failed → Failed, refunded → Refunded |
| `MB_CommissionStatus` | pending → Pending, available → Available, paidOut → Paid Out, reversed → Reversed |
| `MB_PayoutStatus` | requested → Requested, processing → Processing, paid → Paid, failed → Failed |
| `MB_SenderType` | traveler → Traveler, host → Host |
| `MB_Month` | january … december → January … December |
| `MB_IndianState` | All 28 states and 8 union territories. "and" is spelled out in keys. States: andhraPradesh → Andhra Pradesh, arunachalPradesh → Arunachal Pradesh, assam → Assam, bihar → Bihar, chhattisgarh → Chhattisgarh, goa → Goa, gujarat → Gujarat, haryana → Haryana, himachalPradesh → Himachal Pradesh, jharkhand → Jharkhand, karnataka → Karnataka, kerala → Kerala, madhyaPradesh → Madhya Pradesh, maharashtra → Maharashtra, manipur → Manipur, meghalaya → Meghalaya, mizoram → Mizoram, nagaland → Nagaland, odisha → Odisha, punjab → Punjab, rajasthan → Rajasthan, sikkim → Sikkim, tamilNadu → Tamil Nadu, telangana → Telangana, tripura → Tripura, uttarPradesh → Uttar Pradesh, uttarakhand → Uttarakhand, westBengal → West Bengal. Union territories: andamanAndNicobarIslands → Andaman and Nicobar Islands, chandigarh → Chandigarh, dadraAndNagarHaveliAndDamanAndDiu → Dadra and Nagar Haveli and Daman and Diu, delhi → Delhi, jammuAndKashmir → Jammu and Kashmir, ladakh → Ladakh, lakshadweep → Lakshadweep, puducherry → Puducherry |

`MB_ServiceCategory` is both a Listing's category and the service tags on a host card (`Host.specialties`). The design's "Food" and "Local Food" are one item. `completeTrip` is a Listing category only.

The setup script reads these from `scripts/setup/data/picklists.json`. Keep the two in sync.

## 3. Object definitions

### 3.1 Destination — `MB_Destination`
Plural label: Destinations. Title field: `name`. Shown as the "Where Do You Want To Go?" tiles and the footer's destination list.

| Field | Type | Flags | Notes |
|---|---|---|---|
| name | Text | R S | "Manali" |
| slug | Text | R U | |
| state | Picklist `MB_IndianState` | R S | |
| region | Text | S | "Kullu Valley" |
| latitude | PrecisionDecimal | | |
| longitude | PrecisionDecimal | | |
| description | RichText | S | |
| heroImage | Attachment | | Images only, max 5 MB |
| bestMonths | MultiselectPicklist `MB_Month` | | |
| activities | MultiselectPicklist `MB_ServiceCategory` | | |
| isTrending | Boolean | | Default false |
| sortOrder | Integer | | Order of the home page tiles (lowest first) |
| searchKeywords | LongText | S | Alternate spellings, nearby towns ("Srinagar, Gulmarg, Pahalgam") |
| hostCount | Integer | | Derived: number of hosts with hostStatus active ("128 Hosts"); only KYC approval sets active. Stored by an action rather than an aggregation, so it can follow the rule exactly |

### 3.2 Partner — `MB_Partner`
Plural label: Partners. Title field: `name`. A local business a host works with ("connecting guests with local services").

| Field | Type | Flags | Notes |
|---|---|---|---|
| name | Text | R S | |
| partnerType | Picklist `MB_PartnerType` | R | |
| contactName | Text | | |
| phone | Text | | Indian phone validation |
| email | Text | | Email validation |
| gstin | Text | | GSTIN validation |
| address | LongText | | |
| defaultCommissionRate | PrecisionDecimal | | Percent |
| isVerified | Boolean | | Default false |

### 3.3 Host — `MB_Host`
Plural label: Hosts. Title field: `displayName`. Workflow: Single Approver (KYC review), set up in phase 5 with the Ops Admin role. The host card shows: Verified Host badge, rating and review count, `hostRole` label, "displayName — Your{destinationName} Local", "destinationName, stateName", `quote`, `specialties` tags, "Can arrange your entire trip", and the price line.

| Field | Type | Flags | Notes |
|---|---|---|---|
| displayName | Text | R S | "Rahul" |
| handle | Text | R U | Booking link `maddybaba.com/h/{handle}`; lowercase, a–z 0–9 and hyphen |
| hostRole | Picklist `MB_HostRole` | R | The card label |
| hostOffers | MultiselectPicklist `MB_HostOffer` | R | "What can you offer?". The card shows "Can arrange your entire trip" when it contains `fullTrip` |
| phone | Text | R | Indian phone validation |
| quote | Text | S | The quote on the card, max 160 characters |
| bio | LongText | S | Host profile page |
| specialties | MultiselectPicklist `MB_ServiceCategory` | | Card tags and host search |
| avatar | Attachment | | |
| hostStatus | Picklist `MB_HostStatus` | R | Default pendingVerification. `active` (set after KYC approval) shows the Verified Host badge |
| commissionRate | PrecisionDecimal | | Base percent |
| termsAccepted | Boolean | R | Must be true |
| termsAcceptedDate | DateTime | | Set by action |
| payoutUpiId | Text | | Consider storing only a gateway token |
| destinationName | Text | S | Derived from the host's Destination (`destinationHosts`) |
| stateName | Text | S | Derived: the Destination's state label |
| ratingValue | PrecisionDecimal | | Derived: average rating of the host's published reviews (`hostReviews`), 1 decimal; 0 when there are none. Aggregation filters only take date, integer and picklist fields, so a Boolean `isPublished` filter isn't possible and an action stores it |
| reviewCount | Integer | | Derived: number of the host's published reviews |
| priceFrom | PrecisionDecimal | | Derived: lowest basePrice of the host's approved listings other than complete trips ("From ₹1,499") |
| completeTripsFrom | PrecisionDecimal | | Derived: lowest basePrice of the host's approved `completeTrip` listings ("Complete trips from ₹8,999"). 0 when there are none (Liferay stores an empty PrecisionDecimal as 0); the card then shows priceFrom |
| linkClicks | Aggregation | | Count of ReferralClick |
| totalBookings | Aggregation | | Count of Booking via `hostBookings` |
| partnerCount | Aggregation | | Count of HostPartnership where partnershipStatus = active |
| earningsThisMonth | PrecisionDecimal | | Derived: sum of Commission.amount created this month. Aggregation filters only take fixed date ranges on this version, so a scheduled action stores it |
| availableBalance | Aggregation | | Sum of Commission.amount where commissionStatus = available |

A host has one home Destination for now. Places nearby (Gulmarg and Pahalgam for a Kashmir host) go in the destination's `searchKeywords` and the host's `quote`/`bio`.

### 3.4 HostPartnership — `MB_HostPartnership`
Plural label: Host Partnerships. A junction object between Host and Partner, with its own terms.

| Field | Type | Flags |
|---|---|---|
| commissionRate | PrecisionDecimal | R |
| startDate | Date | R |
| endDate | Date | |
| partnershipStatus | Picklist `MB_PartnershipStatus` | R |

### 3.5 Traveler — `MB_Traveler`
Plural label: Travelers. Title field: `fullName`. One per Liferay User.

| Field | Type | Flags | Notes |
|---|---|---|---|
| fullName | Text | R | "As on your ID" |
| phone | Text | | Indian phone validation |
| homeCity | Text | | Shown on reviews ("Delhi → Manali") |
| pastTripCount | Aggregation | | Count of Booking where bookingStatus = completed |

### 3.6 Listing — `MB_Listing`
Plural label: Listings. Title field: `title`. Workflow: Single Approver, set up in phase 5. Everything a host sells: a service (stay, transport, food, tour, activity, experience) or a **complete trip** (`category = completeTrip`), a packaged whole trip with a fixed "from" price.

| Field | Type | Flags | Notes |
|---|---|---|---|
| title | Text | R S | |
| slug | Text | R U | Listing page URL |
| category | Picklist `MB_ServiceCategory` | R S | |
| shortDescription | Text | S | Card subtitle |
| description | RichText | S | |
| basePrice | PrecisionDecimal | R | "From ₹[PRICE]" |
| priceUnit | Picklist `MB_PriceUnit` | R | |
| durationText | Text | | "2 nights", "5 days / 4 nights" |
| maxGuests | Integer | | |
| heroImage | Attachment | | |
| seasonMonths | MultiselectPicklist `MB_Month` | | |
| isTrending | Boolean | | |
| isFeatured | Boolean | | |
| destinationName | Text | S | Derived, see search.md |
| stateName | Text | S | Derived |
| region | Text | S | Derived |
| hostDisplayName | Text | S | Derived |
| searchKeywords | LongText | S | Manual keywords |
| latitude | PrecisionDecimal | | Derived from Destination |
| longitude | PrecisionDecimal | | Derived from Destination |
| ratingValue | PrecisionDecimal | | Derived: average rating of the listing's published reviews, 1 decimal (see Host.ratingValue) |
| reviewCount | Integer | | Derived: number of the listing's published reviews |
| nextAvailableDate | Date | | Derived: earliest open slot |

### 3.7 ListingInclusion — `MB_ListingInclusion`
Plural label: Listing Inclusions. For "What's included" (for a complete trip: stay, transport, food, sightseeing…).

| Field | Type | Flags | Notes |
|---|---|---|---|
| label | Text | R | |
| inclusionType | Picklist `MB_InclusionType` | R | |
| addOnPrice | PrecisionDecimal | | Required when inclusionType = addOn |
| sortOrder | Integer | | |

### 3.8 AvailabilitySlot — `MB_AvailabilitySlot`
Plural label: Availability Slots. For "Pick a date". A complete trip has a slot per start date.

| Field | Type | Flags | Notes |
|---|---|---|---|
| slotDate | Date | R | |
| startTime | Text | | "08:00" |
| capacity | Integer | R | |
| bookedCount | Aggregation | | Sum of BookingItem.quantity |
| priceOverride | PrecisionDecimal | | |
| slotStatus | Picklist `MB_SlotStatus` | R | |

### 3.9 TripPackage — `MB_TripPackage`
Plural label: Trip Packages. The traveler's cart ("Plan My Trip"): items from one or more listings before checkout.

| Field | Type | Flags |
|---|---|---|
| packageName | Text | |
| startDate | Date | R |
| endDate | Date | R |
| adults | Integer | R |
| children | Integer | |
| packageStatus | Picklist `MB_PackageStatus` | R |
| itemCount | Aggregation | Count of BookingItem |
| packageTotal | Aggregation | Sum of BookingItem.lineTotal |

### 3.10 Booking — `MB_Booking`
Plural label: Bookings. Title field: `bookingNumber` (set in phase 4, when the AutoIncrement field is added).

| Field | Type | Flags | Notes |
|---|---|---|---|
| bookingNumber | AutoIncrement | | Prefix `MB-`, start 100001. Always filled by Liferay, so not marked required. Numbers can skip: a Booking POST that fails validation still uses one. If gap-free invoice numbers are needed, add a separate numbering step in phase 7 |
| leadName | Text | R | |
| phone | Text | R | Indian phone validation |
| email | Text | R | Email validation |
| travelDate | Date | R | |
| travelerCount | Integer | R | ≥ 1 |
| subtotal | Aggregation | | Sum of BookingItem.lineTotal |
| serviceFee | PrecisionDecimal | | Derived |
| taxes | PrecisionDecimal | | Derived: GST |
| total | PrecisionDecimal | | Derived: `subtotal + serviceFee + taxes`. Not a Formula: formulas can't read aggregation fields (`Variable "subtotal" not defined`) |
| bookingStatus | Picklist `MB_BookingStatus` | R | Default pendingPayment. Use as a State field if supported |
| source | Picklist `MB_BookingSource` | | |

State transitions for `bookingStatus`: pendingPayment → confirmed / cancelled; confirmed → completed / cancelled; cancelled → refunded.

### 3.11 BookingItem — `MB_BookingItem`
Plural label: Booking Items.

| Field | Type | Flags | Notes |
|---|---|---|---|
| category | Picklist `MB_ServiceCategory` | R | |
| itemTitle | Text | R | Snapshot of the title at booking time |
| itemDetail | Text | | "Manali, 5 days / 4 nights" |
| quantity | Integer | R | ≥ 1 |
| unitPrice | PrecisionDecimal | R | Snapshot of the price |
| lineTotal | PrecisionDecimal | | Derived: `quantity * unitPrice`. Not a Formula: aggregations (subtotal, packageTotal) can't sum Formula fields |
| supplierReference | Text | | External reference (partner booking number) |
| isSelected | Boolean | | Default true |

### 3.12 Payment — `MB_Payment`
Plural label: Payments.

| Field | Type | Flags |
|---|---|---|
| method | Picklist `MB_PaymentMethod` | R |
| amount | PrecisionDecimal | R |
| gateway | Text | R |
| gatewayOrderId | Text | U |
| gatewayTxnId | Text | U |
| paymentStatus | Picklist `MB_PaymentStatus` | R |
| paidAt | DateTime | |

### 3.13 Commission — `MB_Commission`
Plural label: Commissions.

| Field | Type | Flags | Notes |
|---|---|---|---|
| rate | PrecisionDecimal | R | Percent, copied at booking time |
| baseAmount | PrecisionDecimal | R | |
| amount | PrecisionDecimal | | Derived: `baseAmount * rate / 100`. Not a Formula: aggregations (availableBalance) can't sum Formula fields |
| commissionStatus | Picklist `MB_CommissionStatus` | R | |
| availableOn | Date | | |

### 3.14 Payout — `MB_Payout`
Plural label: Payouts.

| Field | Type | Flags |
|---|---|---|
| amount | PrecisionDecimal | R |
| payoutMethod | Text | R |
| gatewayPayoutId | Text | U |
| payoutStatus | Picklist `MB_PayoutStatus` | R |
| requestedAt | DateTime | R |
| processedAt | DateTime | |

### 3.15 ReferralClick — `MB_ReferralClick`
Plural label: Referral Clicks.

| Field | Type | Flags |
|---|---|---|
| clickedAt | DateTime | R |
| channel | Text | |
| converted | Boolean | |

### 3.16 Review — `MB_Review`
Plural label: Reviews. A review of a host (always) and of the listing booked (when there is one). Featured reviews are the home page's "What Travelers Say".

| Field | Type | Flags | Notes |
|---|---|---|---|
| rating | Integer | R | 1–5 |
| comment | LongText | S | |
| isPublished | Boolean | | |
| isFeatured | Boolean | | Ops picks the home page testimonials. Only published reviews are shown |
| reviewerName | Text | | "Ankit & Neha". Filled from Traveler.fullName on add when empty; editable |
| reviewerCity | Text | | "Delhi". Filled from Traveler.homeCity on add when empty; editable |
| hostDisplayName | Text | | Derived from the Host ("Hosted by Rahul"). Guests can't read Host, so the testimonial needs a copy |
| destinationName | Text | | Derived from the Host's Destination ("Delhi → Manali") |

### 3.17 Favorite — `MB_Favorite`
Plural label: Favorites. "Saved Hosts" and saved listings. Has relationship fields only: a Favorite points at a Host or a Listing. Liferay needs at least one field to publish, so Favorite is published in phase 3, after its relationships are added.

### 3.18 Conversation — `MB_Conversation` and Message — `MB_Message`
Plural labels: Conversations, Messages. "One person. One chat." A conversation is between a traveler and a host, optionally about a listing.

Conversation fields: `subject` (Text).

Message fields: `body` (LongText, R), `senderType` (Picklist `MB_SenderType`, R), `readAt` (DateTime).

### 3.19 HostApplication — `MB_HostApplication`
Plural label: Host Applications. A signed-in user's host sign-up or profile edit (docs/website.md 4). Users can't write Host (6.2), so they submit an application, which they own; `mb-actions-service` applies it to their Host (section 7.1) and records the outcome. The user is the entry's creator, set by Liferay, never a field of the request.

| Field | Type | Flags | Notes |
|---|---|---|---|
| applicationType | Picklist `MB_HostApplicationType` | R | |
| displayName | Text | | |
| handle | Text | | Sign-up only; can't be changed later |
| hostRole | Picklist `MB_HostRole` | | |
| hostOffers | MultiselectPicklist `MB_HostOffer` | | |
| phone | Text | | |
| quote | Text | | |
| bio | LongText | | |
| specialties | MultiselectPicklist `MB_ServiceCategory` | | |
| termsAccepted | Boolean | | Must be true for a sign-up (checked when the Host is created) |
| applicationStatus | Picklist `MB_ApplicationStatus` | R | Default submitted. Derived: applied or rejected |
| resultMessage | Text | | Derived: why it was rejected (Host validation messages) |

### 3.20 SearchQueryLog — `MB_SearchQueryLog`
Plural label: Search Query Logs. Written by `mb-search-service` for every search (search.md section 9). No relationships; only Ops Admin can read it.

| Field | Type | Flags | Notes |
|---|---|---|---|
| queryText | Text | | |
| filtersUsed | LongText | | JSON of the other parameters |
| resultCount | Integer | | |
| endpoint | Text | | `trips` or `hosts` |
| source | Picklist `MB_BookingSource` | | web, app or hostLink |
| searchedAt | DateTime | R | |

## 4. Relationships

All are one-to-many unless noted. Relationship ERC = `MB_` + name.

| One (parent) | Many (child) | Name | Deletion type |
|---|---|---|---|
| User (system) | Traveler | userTraveler | prevent |
| User (system) | Host | userHost | prevent |
| Destination | Host | destinationHosts | prevent |
| Destination | Listing | destinationListings | prevent |
| Destination | Partner | destinationPartners | prevent |
| Destination | TripPackage | destinationPackages | prevent |
| Host | Listing | hostListings | prevent |
| Partner | Listing | partnerListings | disassociate |
| Host | HostPartnership | hostPartnerships | cascade |
| Partner | HostPartnership | partnerHosts | cascade |
| Listing | ListingInclusion | listingInclusions | cascade |
| Listing | AvailabilitySlot | listingSlots | cascade |
| Listing | Review | listingReviews | disassociate |
| Traveler | TripPackage | travelerPackages | prevent |
| Host | TripPackage | hostPackages | disassociate |
| TripPackage | BookingItem | packageItems | cascade |
| TripPackage | Booking | packageBookings | disassociate |
| Traveler | Booking | travelerBookings | prevent |
| Host | Booking | hostBookings | prevent |
| Host | Booking | referralBookings | disassociate |
| Booking | BookingItem | bookingItems | cascade |
| Listing | BookingItem | listingBookingItems | disassociate |
| AvailabilitySlot | BookingItem | slotBookingItems | prevent |
| Booking | Payment | bookingPayments | prevent |
| Booking | Commission | bookingCommissions | prevent |
| Host | Commission | hostCommissions | prevent |
| Payout | Commission | payoutCommissions | disassociate |
| Host | Payout | hostPayouts | prevent |
| Host | ReferralClick | hostClicks | cascade |
| Booking | Review | bookingReviews | cascade |
| Host | Review | hostReviews | cascade |
| Traveler | Review | travelerReviews | disassociate |
| Traveler | Favorite | travelerFavorites | cascade |
| Listing | Favorite | listingFavorites | cascade |
| Host | Favorite | hostFavorites | cascade |
| Traveler | Conversation | travelerConversations | cascade |
| Host | Conversation | hostConversations | cascade |
| Listing | Conversation | listingConversations | disassociate |
| Conversation | Message | conversationMessages | cascade |
| Destination | HostApplication | destinationHostApplications | disassociate |
| Host | HostApplication | hostApplications | disassociate |

A BookingItem belongs either to a TripPackage (while the cart is being built) or to a Booking (after checkout). At checkout, set the `bookingItems` relationship on each item; keep the package link for history.

## 5. Validations

Expression rules on a single field show their error on that field (partial validation); the others show it on the form.

| Object | Rule | Type | Error message |
|---|---|---|---|
| Host, Booking | phone matches `^\+91[6-9]\d{9}$` | Expression | Enter a valid Indian mobile number (+91…) |
| Traveler, Partner | phone empty or matches `^\+91[6-9]\d{9}$` | Expression | Enter a valid Indian mobile number (+91…) |
| Booking | email is a valid email address | Expression | Enter a valid email address |
| Partner | email empty or a valid email address | Expression | Enter a valid email address |
| Host | `termsAccepted == true` | Expression | Please accept the host terms and commission policy |
| Host | handle matches `^[a-z0-9-]{3,30}$` | Expression | Use 3–30 lowercase letters, numbers or hyphens |
| Host | quote empty or at most 160 characters | Expression | Keep your quote under 160 characters |
| Host | has a Destination (`r_destinationHosts_c_destinationId > 0`) | Expression (form-level) | Choose your destination |
| Partner | gstin empty or matches `^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$` | Expression | Invalid GSTIN |
| Review | rating between 1 and 5 | Expression | Rating must be 1–5 |
| Review | has a Host (`r_hostReviews_c_hostId > 0`) | Expression (form-level) | Choose the host you're reviewing |
| Favorite | has a Host or a Listing | Expression (form-level) | Choose a host or listing to save |
| HostApplication | phone empty or matches `^\+91[6-9]\d{9}$` | Expression | Enter a valid Indian mobile number (+91…) |
| HostApplication | handle empty or matches `^[a-z0-9-]{3,30}$` | Expression | Use 3–30 lowercase letters, numbers or hyphens |
| HostApplication | quote empty or at most 160 characters | Expression | Keep your quote under 160 characters |
| ListingInclusion | addOnPrice required (above 0) when inclusionType = addOn | Microservice (`mb-actions-service-add-on-price`). Expressions can't read picklists and Groovy is disabled on this instance | Add-ons need a price |
| BookingItem | quantity ≥ 1 | Expression | Quantity must be at least 1 |
| Booking | travelerCount ≥ 1 | Expression | Traveler count must be at least 1 |
| AvailabilitySlot | capacity ≥ 1 | Expression | Capacity must be at least 1 |
| Booking, Conversation, Message | has a host account (`r_account<Object>s_accountEntryId > 0`, section 6.1) | Expression (form-level) | Choose the host account for this booking / conversation / message |
| Payout | a new request (payoutStatus requested) has amount ≤ host availableBalance | Microservice (`mb-actions-service-payout-balance`) | Amount exceeds available balance |
| BookingItem | quantity ≤ places left on its slot (capacity − bookedCount, not counting the item's own stored quantity). Checked per item, not per Booking: a booking has no items (so no slots) when it's created | Microservice (`mb-actions-service-slot-capacity`) | Not enough spots on this date |

## 6. Accounts, roles and permissions

Each Host has a Liferay **Account** (created on host approval). Scripts: `relationships.js`, `objects.js`, `roles.js`, `workflows.js`; local test users: `test-users.js`.

### 6.1 Account restriction

These objects have a one-to-many relationship `account<Object>s` from Account (`L_ACCOUNT`, deletion type prevent) and are **account-restricted** by it: Host, Listing, ListingInclusion, AvailabilitySlot, HostPartnership, Booking, Commission, Payout, ReferralClick, Conversation, Message.

- Account members see and act on their account's entries through **account roles**. A **regular role** with View on the object sees every account's entries. The **owner** of an entry keeps access to it even when not an account member (a traveler sees their own Booking on the host's account).
- To create an entry on an account they don't belong to, a regular-role user needs `Account Entry: View` (Traveler has it; it also lets travelers list host account names).
- Only one relationship drives the restriction, so a referral host can't see referral bookings (`referralBookings`); they see their own Commission records instead.
- The API accepts an entry without an account, which no host can then see. Booking, Conversation and Message have a validation rule "must have a host account" (`r_account<Object>s_accountEntryId > 0`, section 5).
- The Host record is linked to its account by the host-approval action (section 7).

### 6.2 Roles and permissions

`ADD` = add entry. View/Update/Delete apply to entries the role can reach (all entries for regular roles, the account's entries for account roles).

| Role (ERC) | Type | Permissions |
|---|---|---|
| Guest (`L_GUEST`, built-in; only these permissions are managed) | regular | View Destination, ListingInclusion, AvailabilitySlot, Review |
| User (`L_USER`, built-in, every signed-in user; only these permissions are managed) | regular | ADD HostApplication (their own, through the Owner role). View Destination, ListingInclusion, AvailabilitySlot, Review: the public reads, since Guest permissions don't apply once a user signs in (a new user has no MB role until they book or become a host) |
| Traveler (`MB_Traveler`) | regular | View Destination, ListingInclusion, AvailabilitySlot, Review, Account Entry. ADD Traveler, TripPackage, BookingItem, Booking, Review, Favorite, Conversation, Message. Own entries through the Owner role |
| Host (`MB_Host`) | account | View, ADD, Update, Delete Listing, ListingInclusion, AvailabilitySlot, HostPartnership. View Host, Booking, Commission, ReferralClick, Conversation. ADD and View Payout, Message. Every host user also has the regular Traveler role: account roles don't reach company-wide objects such as Destination and Review, which the host dashboard reads (and a host can travel too) |
| Ops Admin (`MB_OpsAdmin`) | regular | ADD, View, Update, Delete, Permissions on every MB object. View Account Entry. Reviews Host and Listing approvals; picks featured reviews |

Deliberate differences from a plain access table:

- **Listings and Hosts are not viewable directly by guests or travelers.** Liferay doesn't hide entries awaiting approval from users with View, and there are no field-level permissions (Host holds phone, payoutUpiId, commissionRate). Public host cards, host profiles and listings are served by `mb-search-service` (phase 8, see search.md) with public fields only. Hosts see their own account's listings and their own Host record (View only, so they can't change hostStatus or commissionRate); host sign-up and profile edits go through a service endpoint (section 7).
- **Destination tiles and testimonials are read directly** (`/o/c/destinations`, `/o/c/reviews`): Guest View on Destination and Review. Destination holds `hostCount`, and Review holds `hostDisplayName`, `destinationName` and the reviewer fields, so neither needs Host access.
- **Payments are not writable by travelers.** Payments are written only by the payment integration (a traveler-created "success" payment would confirm a booking).
- **Reviews**: Guest View includes unpublished reviews. The website and app show only `isPublished = true` (display filter, not access control).

### 6.3 Owner permissions

Liferay grants the Owner role Delete, Permissions, Update and View on each entry when it's created. This can't be changed per object through role permissions. So a traveler can edit or delete their own Booking (they could set `bookingStatus = confirmed` and `total = 1`). Mitigation (section 7): an action on Booking add trims the Owner's entry permissions to View, and no action trusts traveler-supplied values: checkout recalculates fees and totals, only a successful Payment confirms a booking, and commissions need a successful Payment.

### 6.4 Approval workflow

"MB Ops Approval" (`scripts/setup/data/mb-ops-approval.xml`) is Liferay's Single Approver with the review task assigned only to Ops Admin and Administrator. Single Approver also assigns review to the account roles Account Administrator and Account Member, which would let a host approve their own listing. It's linked to Host and Listing (company scope). Editing an approved entry sends it back for review. Exception: when `mb-actions-service` changes only derived fields (section 7) of an approved Host or Listing, it approves the resulting task itself (comment "Automatic update by mb-actions-service"), so the entry stays live. Host edits always go to Ops.

### 6.5 Instance settings (local instance; required on any instance)

Until a user finishes first login, Liferay treats their API requests as a guest's, so none of their roles apply. On this instance:

- Instance Settings: email verification at login is **disabled**.
- Password Policies → Default Password Policy: **Change Required** is off (users created by an admin were forced to change their password first).
- `test-users.js` also accepts the terms of use and sets a reminder question for the test users.

These must be set the same way on the clean instance in phase 9 (and decided for production, where travelers sign up themselves).

## 7. Object actions and jobs

| Trigger | Object | Condition | Action |
|---|---|---|---|
| On add | Host | | Set termsAcceptedDate; start KYC workflow |
| Workflow approved | Host | | Create Account, link the Host record to it (`r_accountHosts_accountEntryId`), assign the Host account role, set hostStatus = active |
| On add | HostApplication | | Sign-up: create the creator's Host (pending review). Profile edit: apply the allowed fields to the creator's Host (back to review). Record applied or rejected with the reason (hosts only have View on Host) |
| On add / update | Host | | Copy destinationName and stateName from the Host's Destination |
| On add / update | Listing | | Copy destinationName, stateName, region, latitude, longitude from Destination and hostDisplayName from Host (see search.md) |
| On update | Destination | name, state, region or coordinates changed | Update the derived fields on its Hosts and Listings |
| On update | Host | displayName changed | Update hostDisplayName on its Listings and Reviews |
| On add / update / delete, workflow change | Listing | | Recompute the Host's priceFrom and completeTripsFrom (approved listings only) |
| On add / update | Host | hostStatus or destination changed | Recompute the Destination's hostCount (active hosts) |
| On add / update | AvailabilitySlot | | Recalculate Listing.nextAvailableDate; set slotStatus = full when bookedCount ≥ capacity |
| On add | Review | | Fill reviewerName and reviewerCity from the Traveler when empty; copy hostDisplayName and destinationName |
| On add / update / delete | Review | | Recalculate ratingValue and reviewCount on the Listing and the Host from their published reviews |
| On add / update | BookingItem | | Set lineTotal = quantity × unitPrice (overwrites any client value) |
| On add / update | Commission | | Set amount = baseAmount × rate / 100 (overwrites any client value) |
| On add | Booking | | Trim the Owner's entry permissions to View (`PUT /o/c/bookings/{id}/permissions`), see section 6.3 |
| Scheduled daily | Host | | Recompute earningsThisMonth = sum of the host's Commission.amount created this month |
| On add / update | Booking | | Compute serviceFee, taxes and total = subtotal + serviceFee + taxes |
| On update | Payment | paymentStatus = success | Booking.bookingStatus = confirmed |
| On update | Booking | bookingStatus = confirmed | Create Commission(s) for host and referral host (commissionStatus pending); notify traveler and host (email/SMS) |
| On update | Booking | bookingStatus = cancelled or refunded | Commission.commissionStatus = reversed; trigger gateway refund |
| Scheduled daily | Commission | Booking completed and availableOn ≤ today | commissionStatus = available |
| On add | Payout | | Call payout gateway (webhook/microservice) |
| Gateway callback | Payout | success | Payout.payoutStatus = paid; linked Commissions → paidOut |

Implement logic heavier than a notification as **microservice client extensions** triggered by object action webhooks. Use Groovy only where the instance allows it (not on Liferay SaaS).

### 7.1 `mb-actions-service`

Spring Boot / Java 21 microservice client extension (phase 7). Object actions (ERC `MB_<Object>_<trigger>`, executor `function#mb-actions-service-<object>`) are registered by `scripts/setup/actions.js`; the service calls Liferay back as its headless-server OAuth2 app (instance administrator). Custom object OAuth2 scopes are named `c_<object name in lower case>.everything[.read]`.

**Trust rule (security).** An object action webhook carries a JWT from the client extension's user-agent OAuth2 app, and any signed-in user can obtain a token for that app. So the payload is never trusted: every handler takes only the entry ID from the request, **re-reads the entry from Liferay** with the service's own identity, and acts on the stored values. In particular, a Payment confirms a booking only if the stored Payment (re-read) has `paymentStatus = success`, a gateway transaction ID, and an amount equal to the booking's stored total. Host sign-up and profile edit don't use user tokens at all: they arrive as HostApplication entries whose creator Liferay records.

- **BookingItem** add/update/delete: `lineTotal = quantity × unitPrice`; refresh the pricing of its booking(s) and the status of its slot(s).
- **Booking** add/update: `serviceFee = 5% of subtotal`, `taxes = 18% GST on the fee`, `total = subtotal + serviceFee + taxes`, rounded half up to the paisa (rates in `application-default.properties`: `mb.pricing.*`). On add, the Owner keeps View only (6.3).
- **Commission** add/update: `amount = baseAmount × rate / 100`.
- **AvailabilitySlot** add/update/delete: slotStatus full when bookedCount ≥ capacity, open again below it (closed slots are left alone); refresh the listing.
- **Listing** add/update/delete, **Destination** update, **Host** update, **Review** add/update/delete: refresh the derived fields of the affected listings (destinationName, stateName, region, latitude, longitude, hostDisplayName, nextAvailableDate = earliest open slot from today IST, ratingValue and reviewCount from published reviews), hosts (destinationName, stateName, ratingValue, reviewCount, priceFrom, completeTripsFrom), destinations (hostCount) and reviews (hostDisplayName, destinationName). If the entry was approved, the service approves its own update (6.4).
- Every handler reads fresh, writes only fields that differ, and so ends any chain it starts.
- Validation rules (section 5): add-on price, payout balance, slot capacity.
- **Host** add: `termsAcceptedDate` = now when `termsAccepted` and no date yet.
- **Host** approved (the update whose workflow status becomes approved): create the host's Account (name = displayName, ERC `MB_account_<host ERC>`) unless the Host is already linked to one, link it (`r_accountHosts_accountEntryId`), add the host's user (`r_userHost_userId`) to it with the Host account role, set `hostStatus = active`. Steps already done are skipped, so re-approval changes nothing.
- **Payment** add/update: when the re-read Payment passes the trust rule, a `pendingPayment` booking becomes `confirmed`.
- **Booking** `bookingStatus` becomes confirmed: commissions, at most one per role (ERC `MB_commission_<booking id>_host` / `_referral`):
  - host (`hostBookings`): `Host.commissionRate` % of the lineTotal of the booking's items whose listing belongs to that host;
  - referral host (`referralBookings`, if different): `mb.commission.referral-percent` (default **5**) % of the subtotal;
  - `commissionStatus = pending`, `availableOn` = trip end (package endDate, else travelDate) + `mb.commission.available-after-days` (default **7**), account = the host's account.
  - Traveler and host notification: logged only until email/SMS is configured.
- **Booking** becomes cancelled or refunded: pending and available commissions become `reversed`; paid-out ones are logged for Ops. Gateway refund: logged.
- **Payout** add (requested): links the host's free available commissions (not linked to another payout), oldest `availableOn` first, while their total fits the amount. The payout-balance rule (section 5) checks against those free commissions, so the same money can't be requested twice. Gateway call: logged.
- **Payout** becomes paid: linked commissions → `paidOut`, `processedAt` set. Becomes failed: linked commissions are released (still available).
- **HostApplication** add (docs/website.md 4): the user is the stored entry's creator (Liferay sets it; the request can't). Sign-up: unless the user already has a Host, create it (ERC `MB_host_user_<user ID>`, `r_userHost_userId` = the creator, hostStatus pendingVerification, the application's fields and destination); profile edit: patch only displayName, hostRole, hostOffers, phone, quote, bio, specialties and destination of the creator's Host. Liferay's Host validation rules apply; the outcome goes back to the application (applicationStatus applied, or rejected with resultMessage), and the application is linked to the Host. Browser OAuth2 tokens (user-agent apps) are not used: on this instance their token exchange fails with invalid_grant.

### 7.2 Scheduled jobs

Jobs run inside `mb-actions-service` (Spring scheduling, IST; run a single instance). `mb.jobs.run-on-startup=true` also runs them once at startup (local testing).

- **Daily 01:30** (`mb.jobs.daily-cron`):
  - pending commissions become `available` when their booking is completed and `availableOn` ≤ today;
  - Host `earningsThisMonth` = sum of the host's commissions created this month (IST), reversed ones excluded; the service approves its own update of approved hosts (6.4);
  - every Listing's, Host's and Review's derived fields and every Destination's hostCount are refreshed, so `nextAvailableDate` moves on as dates pass, and anything an action missed (Liferay doesn't retry an object action while the service is down) is caught up.
- **Payment and payout gateways (Razorpay), refunds and notifications** stay stubbed: logged only (`PAYOUT GATEWAY`, `REFUND`, `NOTIFY`). Integrate when gateway keys and email/SMS are available.

## 8. Integrations outside Liferay Objects

### 8.1 Payments
Use a payment gateway (e.g. Razorpay) for UPI, cards and net banking. The gateway webhook updates Payment records; the Payment handler applies the trust rule (7.1).

### 8.2 Travel Journal
"Discover Somewhere New" and the Travel Journal are Liferay **Blogs** entries on the Maddybaba site, categorized with the vocabulary **Journal Topics**: Hidden places, Weekend trips, Local food, Trekking, Road trips, Local experiences. Not objects.

### 8.3 Content that is not objects
"The MaddyBaba Difference", the Become-a-Host section, the closing call to action and the footer are custom elements with static copy (`docs/website.md` section 3).

### 8.4 Dropped for now
Not in the current design, so not built: flights, AI recommendations (and the weather, public-holiday and recommendation data behind them), the app waitlist, and host subscriptions / Super Host. Add them back to this spec when a design needs them.

## 9. Seed data (local development)

Matches the home page design, so the page can be checked against it.

- **Destinations** (tile order): Manali (Himachal Pradesh), Udaipur (Rajasthan), Rishikesh (Uttarakhand), Goa (Goa), Kashmir (Jammu and Kashmir; keywords Srinagar, Gulmarg, Pahalgam), Meghalaya (Meghalaya; keywords Shillong, Cherrapunji, Sohra).
- **Hosts** (one test user each, section 9.1):

  | Host | Destination | hostRole | hostOffers | specialties | quote |
  |---|---|---|---|---|---|
  | Rahul (`rahul-manali`) | Manali | localTripHost | ownServices, connectServices, planTrips, fullTrip | stay, transport, tours, food, activities | I help travelers arrange stays, transport, food, sightseeing and local experiences. |
  | Priya (`priya-udaipur`) | Udaipur | experienceHost | ownServices, guiding | homestay, food, experiences, photography | Stay in my family haveli, eat what we cook, and see the lakes the way locals do. |
  | Amit (`amit-rishikesh`) | Rishikesh | adventureHost | ownServices, connectServices, guiding, fullTrip | trekking, transport, camping, activities | Treks, riverside camps and rafting — with the transport sorted from Dehradun. |
  | Irfan (`irfan-kashmir`) | Kashmir | localTripHost | connectServices, planTrips, fullTrip | stay, shikara, transport, tours | Houseboat stays, shikara rides and drives to Gulmarg and Pahalgam, all arranged. |

- **Listings** (realistic INR prices; the lowest per host gives the card's price line):
  - Rahul: "Manali complete trip, 5 days / 4 nights" (completeTrip, ₹8,999/person), "Solang Valley day tour" (tours, ₹1,800/person), "Manali–Rohtang cab" (transport, ₹4,500/trip).
  - Priya: "Haveli homestay room" (homestay, ₹1,499/night), "Cook dal baati with my mother" (experiences, ₹1,200/person), "Old city photo walk" (photography, ₹1,500/person).
  - Amit: "Rishikesh adventure trip, 3 days / 2 nights" (completeTrip, ₹6,999/person), "Riverside camp" (camping, ₹1,800/night), "River rafting" (rafting, ₹800/person).
  - Irfan: "Kashmir complete trip, 6 days / 5 nights" (completeTrip, ₹9,499/person), "Dal Lake houseboat" (stay, ₹3,500/night), "Shikara ride" (shikara, ₹900/boat, perGroup).
- **Inclusions** on each complete trip: stay, transport, breakfast and dinner, sightseeing (included); one add-on activity.
- **Availability slots:** every listing, one per day for the next 14 days (stays and camps need a slot per night), plus any date the seed booking uses.
- **Partner:** Manali Pine Cottages (hotel, 12%), linked to Rahul through an active HostPartnership.
- **Traveler:** Ankit Sharma, home city Delhi, with a TripPackage and one confirmed Booking of Rahul's complete trip: 2 × ₹8,999 = ₹17,998; 5% fee ₹899.90 + 18% GST on the fee ₹161.98 = **₹19,059.88**, paid by UPI; commission 10% of ₹17,998 = ₹1,799.80 (pending).
- **Reviews** (published and featured): "Ankit & Neha", Delhi, 5★ for Rahul ("We didn't have to worry about anything. Rahul arranged our stay, cab, sightseeing and food. We just enjoyed Manali."); "Sneha R.", Pune, 5★ for Priya; "Karthik & friends", Bengaluru, 5★ for Amit (texts from the design). Plus a few unfeatured reviews per host. Rating and review counts will be the seed's real values, not the design's placeholders (4.9 · 87), and the same goes for the destination tiles' host counts.
- **Journal:** six Blogs entries, one per Journal Topic.
- No images are seeded.

### 9.1 How it's loaded

`scripts/setup/seed.js` (local instance only; refuses any other `LIFERAY_URL`) loads `scripts/setup/data/seed/`. Entries have ERCs `MB_SEED_…`, are upserted by ERC and only patched where they differ. Seeded Hosts and Listings go through the MB Ops Approval workflow and are approved by the ops test user.

- **People:** the test users from `test-users.js`: one traveler (`mb.test.traveler`, Ankit Sharma), four hosts (`mb.test.host1`–`host4` = Rahul, Priya, Amit, Irfan, each in their own account named after the host's business) and ops admin (`mb.test.ops`). The traveler creates their own profile, package, booking, items and reviews so they own them.
- **Derived values** (lineTotal, commission amount, fees, total, derived Host/Listing/Review/Destination fields, termsAcceptedDate, hostStatus active, Host linked to its account) are left to `mb-actions-service` if it's running, and are otherwise set by hand in the seed so the pages render.
