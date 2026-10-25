# Maddybaba – Search Design

How travelers find local hosts, listings and destinations on the website and app.
Depends on the objects in `docs/data-model.md`. Design reference: `docs/Homepage — desktop.pdf`.

## 1. Overview

The home page hero has four inputs (Where are you going?, Start date, End date, Guests) and one button, **Find Local Hosts**: the primary result is a list of **host cards**, not listings. Listings (services and complete trips) are searched from the host profile, the "Complete Trips" page and the app. Search is split into three layers:

1. **Text search** over Host, Listing and Destination.
2. **Availability filtering** over AvailabilitySlot, for dates and guest count. A host is available when at least one of their approved listings is.
3. **Search endpoints** in a microservice client extension: `GET /search/hosts` (hero, "Explore All Hosts", destination tiles) and `GET /search/trips` (listings), with one response shape each for web and app.

**Implementation (phase 8): all three layers run inside `client-extensions/mb-search-service`.** Liferay Search Blueprints need a Liferay Enterprise Search (LES) subscription, which this instance doesn't have, and synonym sets and Result Rankings have no API in this version. So the service keeps an in-memory copy of what the public may search (approved listings, destinations, approved and active hosts, open slots), refreshed every 60 seconds, and applies the relevance rules of sections 4 and 5 itself. Tuning lives in the repo (`mb-search-service/src/main/resources/search-config.json`). This suits a catalog of up to tens of thousands of listings; beyond that, move text matching to a search index (Liferay with LES, or a dedicated index).

Guests and travelers have no direct View on Listing or Host (data-model.md section 6.2): Liferay would also show entries awaiting approval, and Host holds private fields. So every public list of hosts or listings (host cards, host profile, listing page, Complete Trips) goes through `mb-search-service`, which reads with its own OAuth2 identity and returns only approved listings, active hosts and public fields. Destination tiles and testimonials are read directly from `/o/c/destinations` and `/o/c/reviews` (Guest View). A host's own listings (host dashboard) can call the headless APIs directly.

## 2. What is searchable

| Object | In public search | Title field | Searchable fields |
|---|---|---|---|
| Host | Yes (approved and active only) | displayName | displayName, destinationName, stateName, specialties, hostRole, quote, bio |
| Listing | Yes (approved only) | title | title, shortDescription, description, category, destinationName, stateName, region, hostDisplayName, searchKeywords |
| Destination | Yes | name | name, state, region, searchKeywords |
| All others | No | | Keep indexed for admin lookup (Liferay's own search), never exposed by `mb-search-service` |

Only these may appear in public results:
- Listings with workflow status approved.
- Hosts with workflow status approved and `hostStatus = active`, with **public fields only**: displayName, handle, hostRole, hostOffers, quote, bio, specialties, avatar, destinationName, stateName, ratingValue, reviewCount, priceFrom, completeTripsFrom. Never phone, payoutUpiId, commissionRate, termsAccepted or the earnings fields.

`mb-search-service` must enforce this itself: it searches with its own identity, so Liferay permissions don't filter its results.

Text fields that are only filtered on (category, state, slug, handle) should be indexed as keywords, not analyzed text.

## 3. Denormalized fields

Liferay indexes relationships as IDs, so a search for "Manali" would not match a Listing or Host whose destination is Manali. Host and Listing therefore store copies of related text (defined in data-model.md sections 3.3 and 3.6):

| Field | Source | Kept in sync by |
|---|---|---|
| Listing destinationName, stateName, region, latitude, longitude | Destination | Listing on add/update; Destination on update |
| Listing hostDisplayName | Host.displayName | Listing on add/update; Host on update |
| Listing ratingValue | averageRating aggregation | Review on add/update/delete |
| Listing nextAvailableDate | earliest open AvailabilitySlot | AvailabilitySlot on add/update, plus a daily job (dates pass) |
| Host destinationName, stateName | Destination | Host on add/update; Destination on update |
| Host ratingValue | averageRating aggregation | Review on add/update/delete |
| Host priceFrom, completeTripsFrom | the host's approved listings | Listing on add/update/delete and workflow change |
| Destination hostCount | approved, active hosts | Host on update and workflow change |

Aggregation and formula fields are calculated on read rather than stored, so they can't be relied on for filtering, sorting or facets. Anything used that way must be a stored field.

Implement the sync as a microservice client extension triggered by object actions (`mb-actions-service`, data-model.md section 7). The sync must be idempotent and must not re-trigger itself: update only the changed fields, and skip the update when the values already match.

## 4. Relevance (`mb-search-service`, `QueryMatcher`)

**Query.** Every word of the query must match a field (stop words such as "in", "the", "near" are ignored); a synonym phrase counts as one word with all its alternatives. A document's score is the sum, per word, of its best field boost × match quality: exact word or phrase 1.0, word prefix (3+ letters) 0.8, typo 0.6. Typo tolerance like fuzziness `AUTO` (no edits up to 2 letters, 1 up to 5, then 2) on the fields marked *fuzzy*.

**Hosts** (`/search/hosts`):

| Field | Boost |
|---|---|
| destinationName (fuzzy) | 5 |
| displayName (fuzzy) | 4 |
| specialties (key and label), hostRole (label) | 2 |
| stateName | 2 |
| quote | 1.5 |
| bio | 1 |

A query that matches a destination also matches that destination's `searchKeywords`: "srinagar" finds hosts whose destination is Kashmir (keywords Srinagar, Gulmarg, Pahalgam), with the destinationName boost.

**Listings** (`/search/trips`):

| Field | Boost |
|---|---|
| title (fuzzy) | 5 |
| destinationName (fuzzy) | 4 |
| searchKeywords (fuzzy) | 3 |
| region, stateName, category (key and label) | 2 |
| shortDescription, hostDisplayName | 1.5 |
| description | 1 |

**Destinations** (suggestions and the `destinations` block): name (4, fuzzy), searchKeywords (3, fuzzy), region and state (2).

**Filters (always applied).** Only approved listings and approved hosts with `hostStatus` = active enter the service's catalog.

**Boosts.**
- Hosts: `hostOffers` contains `fullTrip` ×1.3 (the home page promise: one local, your whole trip); `ratingValue ≥ 4.5` ×1.2.
- Listings: `isFeatured = true` ×2; `isTrending = true` ×1.5; `seasonMonths` contains the current month ×1.5; `ratingValue ≥ 4.5` ×1.2.

**Pinned results** (instead of Result Rankings): `search-config.json` → `pins`, per endpoint and query (relevance sort only, and only when the pinned item is in the results).

## 5. Synonym sets

In `search-config.json` → `synonyms` (a phrase in the query matches any phrase of its set):

- manali, old manali, kullu manali, solang
- udaipur, city of lakes
- rishikesh, hrishikesh, shivpuri
- goa, north goa, south goa
- kashmir, srinagar, gulmarg, pahalgam
- meghalaya, shillong, cherrapunji, sohra
- stay, hotel, homestay, haveli, resort, room, houseboat
- camp, camping, tent, glamping
- trek, hike, hiking, trekking
- rafting, river rafting, white water
- shikara, boat ride
- transport, cab, taxi, car, drive
- food, local food, home cooked, cooking
- guide, local guide, city tour, walk
- complete trip, whole trip, full trip, package, tour package

Add more from the zero-result query log (section 9).

## 6. Mapping the search inputs

| Input | Parameter | `/search/hosts` | `/search/trips` |
|---|---|---|---|
| Where are you going? | `q` | Text relevance (section 4). Typeahead from `GET /search/suggest` | same |
| Destination tile | `destination` | Filter on the host's destination slug | Filter on the listing's destination slug |
| Start date, End date | `from`, `to` | Availability step (section 7) | same |
| Guests | `guests` | Through the host's listings (section 7) | Filter `maxGuests ≥ guests` (listings with no maxGuests pass) |
| Service tag / category | `category` | Filter `specialties` contains the key | Filter `category` = key (`completeTrip` for the Complete Trips page) |
| Whole trip | `fullTrip=true` | Filter `hostOffers` contains `fullTrip` | — |
| Near you | `lat`, `lng`, `radiusKm` | — | Haversine distance from the listing's latitude/longitude; `radiusKm` filters, `sort=distance` orders |
| Price | `minPrice`, `maxPrice` | Range filter on the card price (completeTripsFrom, else priceFrom) | Range filter on basePrice (or the slot price, section 7) |
| Sort | `sort` | relevance (default), rating, priceAsc | relevance (default), priceAsc, priceDesc, rating, distance |

The website's hero uses `guests`; the older name `travelers` is accepted as an alias.

Object fields are not indexed as geo-points, so true geo-distance queries are out of scope for now. If location search becomes central, sync Listings to a dedicated index with a `geo_point` field.

## 7. Availability step

For listings:

1. Run the text search with all other filters.
2. Take the listing's open slots (`slotStatus = open`; closed and full slots never count) with `slotDate` between `from` and `to` (`to` defaults to `from`).
3. Keep a listing if at least one slot has `capacity − bookedCount ≥ guests`. Stay, homestay and camping listings need such a slot on every night: `from` up to the day before `to` (just `from` when they're equal). A complete trip needs a slot on a start date in the range.
4. Attach the matching dates and the effective price (`priceOverride` or `basePrice`; the lowest of the matching slots) to each result. Price filters and `sort=price*` use this price.

For hosts: keep a host if **at least one** of their approved listings passes steps 2–3. The card's price line then uses the lowest effective price among the host's available listings (complete trips first, as on the card); `availableListingCount` says how many are available.

Slots come from the catalog copy, so availability can be up to 60 seconds old; the slot-capacity validation (data-model.md section 5) still checks at booking time.

Without `from` and `to`, skip this step: every host and listing passes, listings return `nextAvailableDate`, and host cards use the stored priceFrom and completeTripsFrom.

## 8. API

Implemented in `mb-search-service`. The `/search` endpoints are public and read-only (no login: guests search too; browsers may call them from the origins in `mb.search.cors-origins`); the service reads Liferay with its own OAuth2 app and only returns public fields. `source` (web, app, hostLink; default web) is only logged. Invalid parameters (dates, numbers, unknown sort) return 400.

- `GET /search/hosts`: host cards (below).
- `GET /search/trips`: listings (below).
- `GET /search/suggest?q=`: destinations whose name or keywords match the words typed so far (typos allowed), then earlier queries with results, most frequent first.
- `GET /search/hosts/{handle}`: public host profile: the public host fields (section 2) plus their approved listings (complete trips first) and their published reviews. 404 unless approved and active.
- `GET /search/listings/{slug}`: public listing page: listing fields, description, inclusions, open slots for the next 30 days (date, start time, places left, price) and the host's public card. 404 unless approved.

### `GET /search/hosts`

```
GET /search/hosts?q=manali&from=2026-11-10&to=2026-11-14&guests=2&category=&fullTrip=&minPrice=&maxPrice=&sort=relevance&page=1&pageSize=12
```

```json
{
  "query": { "q": "manali", "from": "2026-11-10", "to": "2026-11-14", "guests": 2 },
  "totalCount": 3,
  "page": 1,
  "pageSize": 12,
  "facets": {
    "specialties": [{ "key": "stay", "label": "Stay", "count": 3 }],
    "hostRole": [{ "key": "localTripHost", "label": "Local Trip Host", "count": 2 }]
  },
  "items": [
    {
      "type": "host",
      "handle": "rahul-manali",
      "displayName": "Rahul",
      "hostRole": { "key": "localTripHost", "label": "Local Trip Host" },
      "verified": true,
      "destinationName": "Manali",
      "stateName": "Himachal Pradesh",
      "quote": "I help travelers arrange stays, transport, food, sightseeing and local experiences.",
      "specialties": [{ "key": "stay", "label": "Stay" }, { "key": "transport", "label": "Transport" }],
      "canArrangeEntireTrip": true,
      "price": { "label": "completeTripsFrom", "amount": 8999, "currency": "INR" },
      "rating": 4.9,
      "reviewCount": 87,
      "avatarUrl": "…",
      "availableListingCount": 3
    }
  ],
  "destinations": []
}
```

`verified` is `hostStatus = active` (always true in public results). `canArrangeEntireTrip` is `hostOffers` contains `fullTrip`. `price.label` is `completeTripsFrom` ("Complete trips from") when the host has a complete trip, else `priceFrom` ("From"); `price` is null when the host has no approved listing. `destinations` lists matching destinations (with hostCount) when `q` names one.

### `GET /search/trips`

```
GET /search/trips?q=manali&category=completeTrip&from=2026-11-10&to=2026-11-14&guests=2&lat=&lng=&radiusKm=&minPrice=&maxPrice=&sort=relevance&page=1&pageSize=20
```

```json
{
  "query": { "q": "manali", "category": "completeTrip", "from": "2026-11-10", "to": "2026-11-14", "guests": 2 },
  "totalCount": 1,
  "page": 1,
  "pageSize": 20,
  "facets": {
    "category": [{ "key": "completeTrip", "label": "Complete Trip", "count": 1 }],
    "state": [{ "key": "himachalPradesh", "label": "Himachal Pradesh", "count": 1 }]
  },
  "items": [
    {
      "type": "listing",
      "id": 12345,
      "externalReferenceCode": "…",
      "title": "Manali complete trip, 5 days / 4 nights",
      "slug": "manali-complete-trip",
      "category": "completeTrip",
      "destinationName": "Manali",
      "stateName": "Himachal Pradesh",
      "host": { "handle": "rahul-manali", "displayName": "Rahul" },
      "price": { "amount": 8999, "currency": "INR", "unit": "perPerson" },
      "durationText": "5 days / 4 nights",
      "rating": 4.9,
      "reviewCount": 87,
      "heroImageUrl": "…",
      "availableDates": ["2026-11-10", "2026-11-11"],
      "distanceKm": null
    }
  ],
  "destinations": [],
  "hosts": []
}
```

### Rules
- p95 latency target: under 800 ms.
- Log every `/search/hosts` and `/search/trips` query (section 9).
- Never return unpublished listings, unapproved or inactive hosts, or private host fields.

## 9. Search analytics

Liferay Analytics Cloud is not used, so `mb-search-service` writes every `/search/hosts` and `/search/trips` call (in the background) to the object `MB_SearchQueryLog` (data-model.md 3.19; Ops Admin only):

| Field | Type |
|---|---|
| queryText | Text |
| filtersUsed | LongText (JSON) |
| resultCount | Integer |
| endpoint | Text (`hosts` or `trips`) |
| source | Picklist `MB_BookingSource` |
| searchedAt | DateTime |

Review weekly:
- Zero-result queries are a guide to new synonyms and to where to recruit hosts.
- Top queries are candidates for pinned results (`search-config.json`), and feed `/search/suggest`.

## 10. Website and app

- **Website hero** ("Find Local Hosts"): a custom element that routes to a `/hosts` page with `q`, `from`, `to`, `guests`.
- **`/hosts` page:** host cards from `/search/hosts`. The home page's "Meet Your Local Hosts" carousel and "Explore All Hosts" use the same endpoint (no query, `sort=rating`); each destination tile links to `/hosts?destination=<slug>`.
- **Destination tiles and testimonials:** read directly from `/o/c/destinations` (sorted by sortOrder, showing hostCount) and `/o/c/reviews` (isFeatured and isPublished).
- **Host and listing pages:** plain `/host?handle=` and `/listing?slug=` content pages (hidden from navigation) whose custom elements call `/search/hosts/{handle}` and `/search/listings/{slug}`. Not display page templates: guests can't read Host or Listing entries directly (data-model.md 6.2), so a display page couldn't render them.
- **Complete Trips page:** `/search/trips?category=completeTrip`.
- **Website elements:** `client-extensions/mb-web-elements`. Page layout lives in `scripts/setup/data/site/site.json`.
- **App:** the search box calls `/search/hosts`; category chips and "See all" call `/search/trips` (guests and travelers can't read listings directly, data-model.md 6.2). Host and listing pages use `/search/hosts/{handle}` and `/search/listings/{slug}`.
- **Autocomplete:** destination names and keywords plus top queries from the log, served by `GET /search/suggest?q=`.

## 11. Testing checklist

- "manali" returns Rahul first; "srinagar" and "gulmarg" return Irfan (destination keywords); "udaipr" (typo) returns Priya.
- "homestay udaipur" returns Priya; "rafting" returns Amit (specialty) on `/search/hosts` and the rafting listing on `/search/trips`.
- `fullTrip=true` excludes Priya; Rahul's card shows "Complete trips from ₹8,999" and Priya's "From ₹1,499".
- A host awaiting approval or with `hostStatus` suspended never appears; a listing awaiting approval never appears and doesn't count towards priceFrom.
- Host results never include phone, payoutUpiId or commissionRate.
- Dates where all of a host's listings are full exclude that host; 3 guests on a slot with 2 spots left exclude that listing.
- Renaming a Destination updates destinationName on its hosts and listings.
- Guests can search; results never include Booking, Payment or Traveler data.
