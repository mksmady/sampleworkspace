# Maddybaba – Liferay Objects Data Model

Source of truth for all Liferay Objects, picklists, relationships, permissions and automation.
Design reference: `docs/Maddybaba_App_Design.pdf`. Search design: `docs/search.md`.

## 0. Conventions

- Every picklist, object definition, field and relationship has an **external reference code (ERC)** prefixed `MB_`.
- Object names: PascalCase singular (`Listing`). Field names: camelCase (`basePrice`). Field ERC = `MB_<Object>_<field>` (`MB_Host_handle`). Field labels are the name split into words (`hostRegion` → Host Region).
- `status` is reserved by Liferay (it's the workflow status), so status picklists are named `<object>Status` (`bookingStatus`).
- Objects appear in the Control Panel under Objects. Comments and categorization are off. No field is localized (this Liferay version keeps `enableLocalization` on for every object and ignores attempts to turn it off).
- Picklist item keys: camelCase (`superHost`); names are the display labels.
- Picklist names are the ERC without `MB_`, split into words (`MB_HostTier` → Host Tier). Picklist item ERC = `<picklist ERC>_<key>` (`MB_HostTier_superHost`).
- Labels are `en-US` only for now.
- Currency is INR. Money fields use **PrecisionDecimal**.
- Scope: all objects are **company-scoped**.
- Field types below use Liferay `businessType` names: `Text`, `LongText`, `RichText`, `Integer`, `LongInteger`, `PrecisionDecimal`, `Boolean`, `Date`, `DateTime`, `Picklist`, `MultiselectPicklist`, `Attachment`, `Aggregation`, `Formula`, `AutoIncrement`, `Relationship`.
- `R` = required. `U` = unique values. Every plain field is indexed (search.md filters, boosts and sorts on non-text fields). `S` = searchable: `Text`/`LongText`/`RichText` fields marked S are indexed as analyzed full text (`en-US`); other text fields are indexed as keywords.
- Attachment fields accept `jpg, jpeg, png, webp` up to 5 MB, uploaded from the user's device, unless noted otherwise.
- `DateTime` fields store in UTC (`timeStorage = convertToUTC`).
- REST paths are generated from the object name, pluralized and lowercased (`/o/c/<name>s`), not from the plural label: AppWaitlist is `/o/c/appwaitlists`. Verify the actual path in `/o/api` after publishing.

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

Some field types and features (AutoIncrement, Formula, aggregation filters, account restriction) depend on the Liferay version. Check the version in CLAUDE.md and flag anything unsupported instead of silently skipping it.

## 2. Picklists

| ERC | Items (key → label) |
|---|---|
| `MB_ServiceCategory` | flight → Flight, stay → Stay, camping → Camping, trekking → Trekking, paragliding → Paragliding, localGuide → Local Guide, activity → Activity, tourPackage → Tour Package |
| `MB_HostType` | partnerStays → Partner Stays, localGuide → Local Guide, activities → Activities, tourPackages → Tour Packages |
| `MB_HostTier` | standard → Standard, superHost → Super Host |
| `MB_HostStatus` | pendingVerification → Pending Verification, active → Active, suspended → Suspended |
| `MB_PartnerType` | hotel → Hotel, resort → Resort, homestay → Homestay, camp → Camp, activityOperator → Activity Operator, transport → Transport |
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
| `MB_SubscriptionStatus` | active → Active, expired → Expired, cancelled → Cancelled |
| `MB_SenderType` | traveler → Traveler, host → Host |
| `MB_RecoFactor` | pastTravel → Past Travel, currentLocation → Current Location, weather → Weather, monthSeason → Month & Season, publicHolidays → Public Holidays |
| `MB_RecoSection` | placesNow → Places at Their Best Now, hostsForYou → Hosts You'll Get Along With, nearYou → Near You This Weekend, longWeekend → Long Weekend |
| `MB_Month` | january … december → January … December |
| `MB_IndianState` | All 28 states and 8 union territories. "and" is spelled out in keys. States: andhraPradesh → Andhra Pradesh, arunachalPradesh → Arunachal Pradesh, assam → Assam, bihar → Bihar, chhattisgarh → Chhattisgarh, goa → Goa, gujarat → Gujarat, haryana → Haryana, himachalPradesh → Himachal Pradesh, jharkhand → Jharkhand, karnataka → Karnataka, kerala → Kerala, madhyaPradesh → Madhya Pradesh, maharashtra → Maharashtra, manipur → Manipur, meghalaya → Meghalaya, mizoram → Mizoram, nagaland → Nagaland, odisha → Odisha, punjab → Punjab, rajasthan → Rajasthan, sikkim → Sikkim, tamilNadu → Tamil Nadu, telangana → Telangana, tripura → Tripura, uttarPradesh → Uttar Pradesh, uttarakhand → Uttarakhand, westBengal → West Bengal. Union territories: andamanAndNicobarIslands → Andaman and Nicobar Islands, chandigarh → Chandigarh, dadraAndNagarHaveliAndDamanAndDiu → Dadra and Nagar Haveli and Daman and Diu, delhi → Delhi, jammuAndKashmir → Jammu and Kashmir, ladakh → Ladakh, lakshadweep → Lakshadweep, puducherry → Puducherry |

The setup script reads these from `scripts/setup/data/picklists.json`. Keep the two in sync.

## 3. Object definitions

### 3.1 Destination — `MB_Destination`
Plural label: Destinations. Title field: `name`.

| Field | Type | Flags | Notes |
|---|---|---|---|
| name | Text | R S | "Bir Billing" |
| slug | Text | R U | |
| state | Picklist `MB_IndianState` | R S | |
| region | Text | S | "Himalayas" |
| latitude | PrecisionDecimal | | |
| longitude | PrecisionDecimal | | |
| description | RichText | S | |
| heroImage | Attachment | | Images only, max 5 MB |
| bestMonths | MultiselectPicklist `MB_Month` | | |
| activities | MultiselectPicklist `MB_ServiceCategory` | | |
| isTrending | Boolean | | Default false |
| searchKeywords | LongText | S | Alternate spellings, nearby towns |

### 3.2 Partner — `MB_Partner`
Plural label: Partners. Title field: `name`.

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
Plural label: Hosts. Title field: `displayName`. Workflow: Single Approver (KYC review), set up in phase 5 with the Ops Admin role.

| Field | Type | Flags | Notes |
|---|---|---|---|
| displayName | Text | R S | |
| handle | Text | R U | Booking link `maddybaba.com/h/{handle}`; lowercase, a–z 0–9 and hyphen |
| hostTypes | MultiselectPicklist `MB_HostType` | R | "What can you offer?" |
| phone | Text | R | Indian phone validation |
| hostRegion | Text | R S | "Bir, Himachal Pradesh" |
| specialties | MultiselectPicklist `MB_ServiceCategory` | | For host search |
| bio | LongText | S | |
| avatar | Attachment | | |
| tier | Picklist `MB_HostTier` | R | Default standard |
| hostStatus | Picklist `MB_HostStatus` | R | Default pendingVerification |
| commissionRate | PrecisionDecimal | | Base percent |
| termsAccepted | Boolean | R | Must be true |
| termsAcceptedDate | DateTime | | Set by action |
| payoutUpiId | Text | | Consider storing only a gateway token |
| linkClicks | Aggregation | | Count of ReferralClick |
| totalBookings | Aggregation | | Count of Booking via `MB_hostBookings` |
| partnerCount | Aggregation | | Count of HostPartnership where partnershipStatus = active |
| earningsThisMonth | PrecisionDecimal | | Sum of Commission.amount created this month. Aggregation filters only take fixed date ranges on this version, so a scheduled action (phase 7) stores it |
| availableBalance | Aggregation | | Sum of Commission.amount where commissionStatus = available |

### 3.4 HostPartnership — `MB_HostPartnership`
Plural label: Host Partnerships. A junction object between Host and Partner, with its own terms.

| Field | Type | Flags |
|---|---|---|
| commissionRate | PrecisionDecimal | R |
| startDate | Date | R |
| endDate | Date | |
| partnershipStatus | Picklist `MB_PartnershipStatus` | R |

### 3.5 HostSubscription — `MB_HostSubscription`
Plural label: Host Subscriptions. For the Super Host plan.

| Field | Type | Flags |
|---|---|---|
| planName | Text | R |
| amount | PrecisionDecimal | R |
| startDate | Date | R |
| endDate | Date | R |
| subscriptionStatus | Picklist `MB_SubscriptionStatus` | R |

### 3.6 Traveler — `MB_Traveler`
Plural label: Travelers. Title field: `fullName`. One per Liferay User.

| Field | Type | Flags | Notes |
|---|---|---|---|
| fullName | Text | R | "As on your ID" |
| phone | Text | | Indian phone validation |
| homeCity | Text | | |
| latitude | PrecisionDecimal | | Only stored with location consent |
| longitude | PrecisionDecimal | | |
| useFactorPastTravel | Boolean | | Default true |
| useFactorLocation | Boolean | | Default false (opt-in) |
| useFactorWeather | Boolean | | Default true |
| useFactorSeason | Boolean | | Default true |
| useFactorHolidays | Boolean | | Default true |
| pastTripCount | Aggregation | | Count of Booking where bookingStatus = completed |

### 3.7 Listing — `MB_Listing`
Plural label: Listings. Title field: `title`. Workflow: Single Approver, set up in phase 5. Covers stays, camps, treks, paragliding, guides and activities. Flights are not listings (see 8.1).

| Field | Type | Flags | Notes |
|---|---|---|---|
| title | Text | R S | |
| slug | Text | R U | Display page URL |
| category | Picklist `MB_ServiceCategory` | R S | |
| shortDescription | Text | S | Card subtitle |
| description | RichText | S | |
| basePrice | PrecisionDecimal | R | "From ₹[PRICE]" |
| priceUnit | Picklist `MB_PriceUnit` | R | |
| durationText | Text | | "2 nights" |
| maxGuests | Integer | | |
| heroImage | Attachment | | |
| seasonMonths | MultiselectPicklist `MB_Month` | | |
| isTrending | Boolean | | |
| isFeatured | Boolean | | |
| averageRating | Aggregation | | Average of Review.rating |
| reviewCount | Aggregation | | Count of Review |
| destinationName | Text | S | Denormalized, see search.md |
| stateName | Text | S | Denormalized |
| region | Text | S | Denormalized |
| hostDisplayName | Text | S | Denormalized |
| searchKeywords | LongText | S | Manual keywords |
| latitude | PrecisionDecimal | | Copied from Destination |
| longitude | PrecisionDecimal | | Copied from Destination |
| ratingValue | PrecisionDecimal | | Stored copy of averageRating, for sorting |
| nextAvailableDate | Date | | Earliest open slot |

### 3.8 ListingInclusion — `MB_ListingInclusion`
Plural label: Listing Inclusions. For "What's included".

| Field | Type | Flags | Notes |
|---|---|---|---|
| label | Text | R | |
| inclusionType | Picklist `MB_InclusionType` | R | |
| addOnPrice | PrecisionDecimal | | Required when inclusionType = addOn |
| sortOrder | Integer | | |

### 3.9 AvailabilitySlot — `MB_AvailabilitySlot`
Plural label: Availability Slots. For "Pick a date".

| Field | Type | Flags | Notes |
|---|---|---|---|
| slotDate | Date | R | |
| startTime | Text | | "08:00" |
| capacity | Integer | R | |
| bookedCount | Aggregation | | Sum of BookingItem.quantity |
| priceOverride | PrecisionDecimal | | |
| slotStatus | Picklist `MB_SlotStatus` | R | |

### 3.10 TripPackage — `MB_TripPackage`
Plural label: Trip Packages. For the "Build your trip" cart.

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

### 3.11 Booking — `MB_Booking`
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
| serviceFee | PrecisionDecimal | | Set by action |
| taxes | PrecisionDecimal | | GST, set by action |
| total | PrecisionDecimal | | `subtotal + serviceFee + taxes`, stored by the checkout action (phase 7). Not a Formula: formulas can't read aggregation fields (`Variable "subtotal" not defined`) |
| bookingStatus | Picklist `MB_BookingStatus` | R | Default pendingPayment. Use as a State field if supported |
| source | Picklist `MB_BookingSource` | | |

State transitions for `bookingStatus`: pendingPayment → confirmed / cancelled; confirmed → completed / cancelled; cancelled → refunded.

### 3.12 BookingItem — `MB_BookingItem`
Plural label: Booking Items.

| Field | Type | Flags | Notes |
|---|---|---|---|
| category | Picklist `MB_ServiceCategory` | R | |
| itemTitle | Text | R | Snapshot of the title at booking time |
| itemDetail | Text | | "Delhi → Dharamshala (Gaggal)" |
| quantity | Integer | R | ≥ 1 |
| unitPrice | PrecisionDecimal | R | Snapshot of the price |
| lineTotal | PrecisionDecimal | | `quantity * unitPrice`, stored by an action (phase 7). Not a Formula: aggregations (subtotal, packageTotal) can't sum Formula fields |
| supplierReference | Text | | PNR or external reference |
| isSelected | Boolean | | Default true |

### 3.13 Payment — `MB_Payment`
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

### 3.14 Commission — `MB_Commission`
Plural label: Commissions.

| Field | Type | Flags | Notes |
|---|---|---|---|
| rate | PrecisionDecimal | R | Percent, copied at booking time |
| baseAmount | PrecisionDecimal | R | |
| amount | PrecisionDecimal | | `baseAmount * rate / 100`, stored by an action (phase 7). Not a Formula: aggregations (availableBalance) can't sum Formula fields |
| commissionStatus | Picklist `MB_CommissionStatus` | R | |
| availableOn | Date | | |

### 3.15 Payout — `MB_Payout`
Plural label: Payouts.

| Field | Type | Flags |
|---|---|---|
| amount | PrecisionDecimal | R |
| payoutMethod | Text | R |
| gatewayPayoutId | Text | U |
| payoutStatus | Picklist `MB_PayoutStatus` | R |
| requestedAt | DateTime | R |
| processedAt | DateTime | |

### 3.16 ReferralClick — `MB_ReferralClick`
Plural label: Referral Clicks.

| Field | Type | Flags |
|---|---|---|
| clickedAt | DateTime | R |
| channel | Text | |
| converted | Boolean | |

### 3.17 Review — `MB_Review`
Plural label: Reviews.

| Field | Type | Flags |
|---|---|---|
| rating | Integer | R (1–5) |
| comment | LongText | S |
| isPublished | Boolean | |

### 3.18 Favorite — `MB_Favorite`
Plural label: Favorites. Has relationship fields only. Liferay needs at least one field to publish, so Favorite is published in phase 3, after its relationships are added.

### 3.19 Conversation — `MB_Conversation` and Message — `MB_Message`
Plural labels: Conversations, Messages.

Conversation fields: `subject` (Text).

Message fields: `body` (LongText, R), `senderType` (Picklist `MB_SenderType`, R), `readAt` (DateTime).

### 3.20 PublicHoliday — `MB_PublicHoliday`
Plural label: Public Holidays.

| Field | Type | Flags |
|---|---|---|
| name | Text | R |
| holidayDate | Date | R |
| longWeekendStart | Date | |
| longWeekendEnd | Date | |
| leaveDaysNeeded | Integer | |
| applicableStates | MultiselectPicklist `MB_IndianState` | |

### 3.21 WeatherSnapshot — `MB_WeatherSnapshot`
Plural label: Weather Snapshots.

| Field | Type | Flags |
|---|---|---|
| forecastDate | Date | R |
| condition | Text | |
| tempC | PrecisionDecimal | |
| isGoodForActivity | Boolean | |

### 3.22 Recommendation — `MB_Recommendation`
Plural label: Recommendations.

| Field | Type | Flags |
|---|---|---|
| reasonText | Text | R |
| factorsUsed | MultiselectPicklist `MB_RecoFactor` | R |
| section | Picklist `MB_RecoSection` | R |
| score | PrecisionDecimal | |
| generatedAt | DateTime | R |
| expiresAt | DateTime | |

### 3.23 AppWaitlist — `MB_AppWaitlist`
Plural label: App Waitlist Entries.

| Field | Type | Flags |
|---|---|---|
| email | Text | R U |
| source | Text | |
| signedUpAt | DateTime | R |

## 4. Relationships

All are one-to-many unless noted. Relationship ERC = `MB_` + name.

| One (parent) | Many (child) | Name | Deletion type |
|---|---|---|---|
| User (system) | Traveler | userTraveler | prevent |
| User (system) | Host | userHost | prevent |
| Destination | Listing | destinationListings | prevent |
| Destination | Partner | destinationPartners | prevent |
| Destination | TripPackage | destinationPackages | prevent |
| Destination | WeatherSnapshot | destinationWeather | cascade |
| Host | Listing | hostListings | prevent |
| Partner | Listing | partnerListings | disassociate |
| Host | HostPartnership | hostPartnerships | cascade |
| Partner | HostPartnership | partnerHosts | cascade |
| Host | HostSubscription | hostSubscriptions | cascade |
| Listing | ListingInclusion | listingInclusions | cascade |
| Listing | AvailabilitySlot | listingSlots | cascade |
| Listing | Review | listingReviews | cascade |
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
| Host | Review | hostReviews | disassociate |
| Traveler | Review | travelerReviews | disassociate |
| Traveler | Favorite | travelerFavorites | cascade |
| Listing | Favorite | listingFavorites | cascade |
| Traveler | Conversation | travelerConversations | cascade |
| Host | Conversation | hostConversations | cascade |
| Listing | Conversation | listingConversations | disassociate |
| Conversation | Message | conversationMessages | cascade |
| Traveler | Recommendation | travelerRecommendations | cascade |
| Listing | Recommendation | listingRecommendations | disassociate |
| Destination | Recommendation | destinationRecommendations | disassociate |
| Host | Recommendation | hostRecommendations | disassociate |

A BookingItem belongs either to a TripPackage (while the cart is being built) or to a Booking (after checkout). At checkout, set the `bookingItems` relationship on each item; keep the package link for history.

## 5. Validations

Expression rules on a single field show their error on that field (partial validation); the others show it on the form.

| Object | Rule | Type | Error message |
|---|---|---|---|
| Host, Booking | phone matches `^\+91[6-9]\d{9}$` | Expression | Enter a valid Indian mobile number (+91…) |
| Traveler, Partner | phone empty or matches `^\+91[6-9]\d{9}$` | Expression | Enter a valid Indian mobile number (+91…) |
| Booking | email is a valid email address | Expression | Enter a valid email address |
| Partner | email empty or a valid email address | Expression | Enter a valid email address |
| AppWaitlist | email is a valid email address | Expression | Enter a valid email address |
| Host | `termsAccepted == true` | Expression | Please accept the host terms and commission policy |
| Host | handle matches `^[a-z0-9-]{3,30}$` | Expression | Use 3–30 lowercase letters, numbers or hyphens |
| Partner | gstin empty or matches `^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$` | Expression | Invalid GSTIN |
| Review | rating between 1 and 5 | Expression | Rating must be 1–5 |
| ListingInclusion | addOnPrice required when inclusionType = addOn | Microservice (phase 7, `objectValidationRule` client extension). Expressions can't read picklists and Groovy is disabled on this instance; the expression rule stays inactive until then | Add-ons need a price |
| BookingItem | quantity ≥ 1 | Expression | Quantity must be at least 1 |
| Booking | travelerCount ≥ 1 | Expression | Traveler count must be at least 1 |
| AvailabilitySlot | capacity ≥ 1 | Expression | Capacity must be at least 1 |
| Booking, Conversation, Message | has a host account (`r_account<Object>s_accountEntryId > 0`, section 6.1) | Expression (form-level) | Choose the host account for this booking / conversation / message |
| Payout | amount ≤ host availableBalance | Microservice (phase 7) | Amount exceeds available balance |
| Booking | travelerCount ≤ remaining slot capacity | Microservice (phase 7) | Not enough spots on this date |

## 6. Accounts, roles and permissions

Each Host has a Liferay **Account** (created on host approval). Scripts: `relationships.js`, `objects.js`, `roles.js`, `workflows.js`; local test users: `test-users.js`.

### 6.1 Account restriction

These objects have a one-to-many relationship `account<Object>s` from Account (`L_ACCOUNT`, deletion type prevent) and are **account-restricted** by it: Host, Listing, ListingInclusion, AvailabilitySlot, HostPartnership, HostSubscription, Booking, Commission, Payout, ReferralClick, Conversation, Message.

- Account members see and act on their account's entries through **account roles**. A **regular role** with View on the object sees every account's entries. The **owner** of an entry keeps access to it even when not an account member (a traveler sees their own Booking on the host's account).
- To create an entry on an account they don't belong to, a regular-role user needs `Account Entry: View` (Traveler has it; it also lets travelers list host account names).
- Only one relationship drives the restriction, so a referral host can't see referral bookings (`referralBookings`); they see their own Commission records instead.
- The API accepts an entry without an account, which no host can then see. Booking, Conversation and Message have a validation rule "must have a host account" (`r_account<Object>s_accountEntryId > 0`, section 5 scripts).
- The Host record is linked to its account by the host-approval action (section 7).

### 6.2 Roles and permissions

`ADD` = add entry. View/Update/Delete apply to entries the role can reach (all entries for regular roles, the account's entries for account roles).

| Role (ERC) | Type | Permissions |
|---|---|---|
| Guest (`L_GUEST`, built-in; only these permissions are managed) | regular | View Destination, ListingInclusion, AvailabilitySlot, Review. ADD AppWaitlist |
| Traveler (`MB_Traveler`) | regular | View Destination, ListingInclusion, AvailabilitySlot, Review, Account Entry. ADD Traveler, TripPackage, BookingItem, Booking, Review, Favorite, Conversation, Message. Own entries through the Owner role |
| Host (`MB_Host`) | account | View, ADD, Update, Delete Listing, ListingInclusion, AvailabilitySlot, HostPartnership. View Host, Booking, Commission, ReferralClick, Conversation. ADD and View Payout, Message |
| Super Host (`MB_SuperHost`) | account | Same as Host (early-access features to follow) |
| Ops Admin (`MB_OpsAdmin`) | regular | ADD, View, Update, Delete, Permissions on every MB object. View Account Entry. Reviews Host and Listing approvals |

Deliberate differences from the original access table:

- **Listings are not viewable directly by guests or travelers.** Liferay doesn't hide entries awaiting approval from users with View, so public listings (approved only) are served by `mb-search-service` (phase 8, see search.md). Hosts see their own account's listings; Ops sees all.
- **No direct Host access for guests or travelers.** There are no field-level permissions, and Host holds private fields (phone, payoutUpiId, commissionRate). The public host profile comes from `mb-search-service` with public fields only. Hosts see their own Host record (View only, so they can't change tier, hostStatus or commissionRate); host sign-up and profile edits go through a phase 7 service.
- **Payments and Recommendations are not writable by travelers.** Payments are written only by the payment integration (a traveler-created "success" payment would confirm a booking). Recommendations are created by the nightly job, so travelers don't own them; a phase 7/8 endpoint serves them per traveler.
- **Reviews**: Guest View includes unpublished reviews. The website and app show only `isPublished = true` (display filter, not access control).

### 6.3 Owner permissions

Liferay grants the Owner role Delete, Permissions, Update and View on each entry when it's created. This can't be changed per object through role permissions. So a traveler can edit or delete their own Booking (tested: they could set `bookingStatus = confirmed` and `total = 1`). Mitigation (phase 7, section 7): an action on Booking add trims the Owner's entry permissions to View, and no action trusts traveler-supplied values: checkout recalculates fees and totals, only a successful Payment webhook confirms a booking, and commissions need a successful Payment.

### 6.4 Approval workflow

"MB Ops Approval" (`scripts/setup/data/mb-ops-approval.xml`) is Liferay's Single Approver with the review task assigned only to Ops Admin and Administrator. Single Approver also assigns review to the account roles Account Administrator and Account Member, which would let a host approve their own listing. It's linked to Host and Listing (company scope). Editing an approved entry sends it back for review.

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
| On add | Booking | | Trim the Owner's entry permissions to View (`PUT /o/c/bookings/{id}/permissions`), see section 6.3 |
| Host sign-up / profile edit | Host | | Service endpoint that creates the Host entry and applies allowed profile changes (hosts only have View on Host) |
| On add / update | Listing | | Copy destinationName, stateName, region, latitude, longitude from Destination and hostDisplayName from Host (see search.md) |
| On update | Destination / Host | name or region changed | Update denormalized fields on related Listings |
| On add / update | AvailabilitySlot | | Recalculate Listing.nextAvailableDate; set slotStatus = full when bookedCount ≥ capacity |
| On add / update | Review | | Recalculate Listing.ratingValue |
| On add / update | BookingItem | | Set lineTotal = quantity × unitPrice (overwrites any client value) |
| On add / update | Commission | | Set amount = baseAmount × rate / 100 (overwrites any client value) |
| Scheduled daily | Host | | Recompute earningsThisMonth = sum of the host's Commission.amount created this month |
| Before checkout | Booking | | Compute serviceFee, taxes and total = subtotal + serviceFee + taxes (microservice) |
| On update | Payment | paymentStatus = success | Booking.bookingStatus = confirmed |
| On update | Booking | bookingStatus = confirmed | Create Commission(s) for host and referral host (commissionStatus pending); notify traveler and host (email/SMS) |
| On update | Booking | bookingStatus = cancelled or refunded | Commission.commissionStatus = reversed; trigger gateway refund |
| Scheduled daily | Commission | Booking completed and availableOn ≤ today | commissionStatus = available |
| On add | Payout | | Call payout gateway (webhook/microservice) |
| Gateway callback | Payout | success | Payout.payoutStatus = paid; linked Commissions → paidOut |
| Scheduled nightly | WeatherSnapshot, PublicHoliday | | Refresh from weather and holiday APIs |
| Scheduled nightly | Recommendation | | Regenerate per traveler, respecting the `useFactor*` toggles; delete expired |

Implement logic heavier than a notification as **microservice client extensions** triggered by object action webhooks. Use Groovy only where the instance allows it (not on Liferay SaaS).

## 8. Integrations outside Liferay Objects

### 8.1 Flights
Flights come from a supplier API through a microservice client extension. They are not stored as Listings. A confirmed fare is saved as a BookingItem with `category = flight`, `itemDetail` = route, and `supplierReference` = PNR.

### 8.2 Payments
Use a payment gateway (e.g. Razorpay) for UPI, cards and net banking. The gateway webhook updates Payment records.

### 8.3 Content that is not objects
The "Other apps" comparison table, marketing copy and footer are Web Content and fragments.

## 9. Seed data (local development)

- Destinations: Bir Billing (Himachal Pradesh), Rishikesh (Uttarakhand), Kasol (Himachal Pradesh), McLeod Ganj (Himachal Pradesh)
- Listings:
  - Tandem paragliding, Bir Billing (paragliding, per person)
  - Riverside camp, Kasol (camping, per night)
  - Triund trek, McLeod Ganj (trekking)
  - River rafting, Rishikesh (activity)
  - Partner mountain camp, Bir (stay)
  - Rajgundha valley day hike (trekking)
  - Monastery & village walk (local guide)
- Inclusions for paragliding: transport to take-off point, tandem flight with certified pilot, safety gear and briefing (all included); photos & video (add-on)
- Availability slots for the next 14 days on each activity listing
- Two hosts: a local pilot/guide in Bir, and a partner host in Rishikesh
- One partner camp, linked to the Bir host through HostPartnership
- One traveler with a sample TripPackage (flight, stay, paragliding) and one confirmed Booking with Payment and Commission
- Public holidays for the next 12 months

Use realistic INR prices in the seed data.
