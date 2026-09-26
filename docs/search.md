# Maddybaba – Search Design

How travelers find listings, destinations and hosts on the website and app.
Depends on the objects in `docs/data-model.md`.

## 1. Overview

The hero search has four inputs (Where to, Dates, Travelers, Looking for), and the app has a single search box with category chips. Search is split into three layers:

1. **Text search** over Listing, Destination and Host.
2. **Availability filtering** over AvailabilitySlot, for dates and traveler count.
3. **A search orchestrator** microservice client extension (`GET /search/trips`) that combines both, adds flight results, and returns one response shape to web and app.

**Implementation (phase 8): all three layers run inside `client-extensions/mb-search-service`.** Liferay Search Blueprints need a Liferay Enterprise Search (LES) subscription, which this instance doesn't have, and synonym sets and Result Rankings have no API in this version. So the service keeps an in-memory copy of what the public may search (approved listings, destinations, approved and active hosts, open slots), refreshed every 60 seconds, and applies the relevance rules of sections 4 and 5 itself. Tuning lives in the repo (`mb-search-service/src/main/resources/search-config.json`). This suits a catalog of up to tens of thousands of listings; beyond that, move text matching to a search index (Liferay with LES, or a dedicated index).

Guests and travelers have no direct View on Listing or Host (data-model.md section 6.2): Liferay would also show listings awaiting approval, and Host holds private fields. So every public list of listings or hosts (category pages, "See all", listing detail, host profile) goes through `mb-search-service`, which reads with its own OAuth2 identity and returns only approved listings, active hosts and public fields. A host's own listings (host dashboard) can call the headless APIs directly.

## 2. What is searchable

| Object | In public search | Title field | Searchable fields |
|---|---|---|---|
| Listing | Yes | title | title, shortDescription, description, category, destinationName, stateName, region, hostDisplayName, searchKeywords |
| Destination | Yes | name | name, state, region, searchKeywords |
| Host | Yes (active only) | displayName | displayName, hostRegion, specialties, bio |
| All others | No | | Keep indexed for admin lookup (Liferay's own search), never exposed by `mb-search-service` |

Only these may appear in public results:
- Listings with workflow status approved.
- Hosts with `hostStatus = active`, with public fields only (displayName, handle, hostRegion, specialties, bio, avatar, tier).

`mb-search-service` must enforce this itself: it searches with its own identity, so Liferay permissions don't filter its results.

Text fields that are only filtered on (category, state, slug) should be indexed as keywords, not analyzed text.

## 3. Denormalized fields

Liferay indexes relationships as IDs, so a search for "Bir Billing" would not match a Listing whose destination is Bir Billing. Listing therefore stores copies of related text (defined in data-model.md section 3.7):

| Listing field | Source | Kept in sync by |
|---|---|---|
| destinationName | Destination.name | Listing on add/update; Destination on update |
| stateName | Destination.state label | same |
| region | Destination.region | same |
| latitude / longitude | Destination | same |
| hostDisplayName | Host.displayName | Listing on add/update; Host on update |
| ratingValue | averageRating aggregation | Review on add/update |
| nextAvailableDate | earliest open AvailabilitySlot | AvailabilitySlot on add/update, plus a daily job (dates pass) |

Aggregation and formula fields are calculated on read rather than stored, so they can't be relied on for filtering, sorting or facets. Anything used that way must be a stored field.

Implement the sync as a microservice client extension triggered by object actions. The sync must be idempotent and must not re-trigger itself: update only the changed fields, and skip the update when the values already match.

## 4. Relevance (`mb-search-service`, `QueryMatcher`)

**Query.** Every word of the query must match a field (stop words such as "in", "the", "near" are ignored); a synonym phrase counts as one word with all its alternatives. A document's score is the sum, per word, of its best field boost × match quality: exact word or phrase 1.0, word prefix (3+ letters) 0.8, typo 0.6.

| Field | Boost |
|---|---|
| title | 5 |
| destinationName | 4 |
| searchKeywords | 3 |
| region, stateName, category (key and label) | 2 |
| shortDescription, hostDisplayName | 1.5 |
| description | 1 |

Typo tolerance like fuzziness `AUTO` (no edits up to 2 letters, 1 up to 5, then 2) on title, destinationName and searchKeywords. Destinations are matched on name (4, fuzzy), searchKeywords (3, fuzzy), region and state (2); hosts on displayName (4, fuzzy), hostRegion and specialties (2) and bio (1). A word in the description alone still matches (e.g. the Bir camp for "paragliding", whose description mentions the landing site), just ranked lower.

**Filters (always applied).** Only approved listings and approved hosts with `hostStatus` = active enter the service's catalog.

**Boosts.**
- `isFeatured = true` ×2
- `isTrending = true` ×1.5
- `seasonMonths` contains the current month ×1.5
- `ratingValue ≥ 4.5` ×1.2

**Pinned results** (instead of Result Rankings): `search-config.json` → `pins`. The flagship paragliding listing is first for the query "paragliding" (relevance sort only, and only when it's in the results).

## 5. Synonym sets

In `search-config.json` → `synonyms` (a phrase in the query matches any phrase of its set):

- bir, bir billing, billing
- dharamshala, dharamsala, gaggal, kangra
- mcleod ganj, mcleodganj, mcleod, dharamkot
- rishikesh, hrishikesh, rishikesh uttarakhand
- kasol, parvati valley, tosh, malana
- rafting, river rafting, white water
- stay, hotel, homestay, resort, room
- camp, camping, tent, glamping
- trek, hike, hiking, trekking
- paragliding, tandem flight, tandem paragliding
- guide, local guide, city tour, walk
- flight, flights, tickets, air ticket

Add more from the zero-result query log (section 9).

## 6. Mapping the search inputs

| Input | Parameter | Handling |
|---|---|---|
| Where to | `q` | Text relevance (section 4). Typeahead from `GET /search/suggest` |
| Looking for | `category` | Filter `category` = picklist key. The app's filter chips use the same parameter |
| Travelers | `travelers` | Filter `maxGuests ≥ travelers` (listings with no maxGuests pass) |
| Dates | `from`, `to` | Availability step (section 7) |
| Near you | `lat`, `lng`, `radiusKm` | Haversine distance from the listing's latitude/longitude (copied from its destination); `radiusKm` filters, `sort=distance` orders |
| Price | `minPrice`, `maxPrice` | Range filter on basePrice |
| Sort | `sort` | relevance (default), priceAsc, priceDesc, rating, distance |

Object fields are not indexed as geo-points, so true geo-distance queries are out of scope for now. If location search becomes central, sync Listings to a dedicated index with a `geo_point` field.

## 7. Availability step

1. Run the text search with all other filters.
2. Take the listing's open slots (`slotStatus = open`; closed and full slots never count) with `slotDate` between `from` and `to` (`to` defaults to `from`).
3. Keep a listing if at least one slot has `capacity − bookedCount ≥ travelers`. Stay and camping listings need such a slot on every night: `from` up to the day before `to` (just `from` when they're equal).
4. Attach the matching dates and the effective price (`priceOverride` or `basePrice`; the lowest of the matching slots) to each result. Price filters and `sort=price*` use this price.

Slots come from the catalog copy, so availability can be up to 60 seconds old; the slot-capacity validation (data-model.md section 5) still checks at booking time.

Without `from` and `to`, skip this step and return `nextAvailableDate` instead.

## 8. Orchestrator API — `GET /search/trips`

Implemented in `mb-search-service`. The `/search` endpoints are public and read-only (no login: guests search too; browsers may call them from the origins in `mb.search.cors-origins`); the service reads Liferay with its own OAuth2 app and only returns public fields. Also:

- `GET /search/suggest?q=`: destinations whose name or keywords match the words typed so far (typos allowed), then earlier queries with results, most frequent first.
- `GET /search/listings/{slug}`: public listing page: listing fields, description, inclusions, open slots for the next 30 days (date, start time, places left, price) and the host's public profile. 404 unless approved.
- `GET /search/hosts/{handle}`: public host profile (displayName, handle, hostRegion, specialties, bio, avatar, tier) with their approved listings. 404 unless approved and active.

Invalid parameters (dates, numbers, unknown sort) return 400.

### Request
```
GET /search/trips?q=bir&category=paragliding&from=2026-10-02&to=2026-10-04&travelers=2&lat=28.61&lng=77.20&radiusKm=500&minPrice=&maxPrice=&sort=relevance&page=1&pageSize=20
```

All parameters are optional. `category` = flight routes the query to the flight supplier (see data-model.md section 8.1). With no category, include up to three flight options when `q` resolves to a destination with an airport. **Until a flight supplier is chosen, `flights` is always empty and `category=flight` returns no results.** `source` (web, app, hostLink; default web) is only logged.

### Response
```json
{
  "query": { "q": "bir", "category": "paragliding", "from": "2026-10-02", "to": "2026-10-04", "travelers": 2 },
  "totalCount": 12,
  "page": 1,
  "pageSize": 20,
  "facets": {
    "category": [{ "key": "paragliding", "label": "Paragliding", "count": 7 }],
    "state": [{ "key": "himachalPradesh", "label": "Himachal Pradesh", "count": 12 }]
  },
  "items": [
    {
      "type": "listing",
      "id": 12345,
      "externalReferenceCode": "…",
      "title": "Tandem paragliding over the Dhauladhar range",
      "slug": "tandem-paragliding-bir-billing",
      "category": "paragliding",
      "destinationName": "Bir Billing",
      "stateName": "Himachal Pradesh",
      "hostDisplayName": "…",
      "price": { "amount": 3000, "currency": "INR", "unit": "perPerson" },
      "rating": 4.8,
      "reviewCount": 120,
      "heroImageUrl": "…",
      "availableDates": ["2026-10-02", "2026-10-03"],
      "distanceKm": 480
    }
  ],
  "destinations": [],
  "hosts": [],
  "flights": []
}
```

### Rules
- p95 latency target: under 800 ms without flights. Flight results may load in a second call (`/search/flights`) if the supplier is slow.
- Log every query (section 9).
- Never return unpublished listings or inactive hosts.

## 9. Search analytics

Liferay Analytics Cloud is not used, so `mb-search-service` writes every `/search/trips` call (in the background) to the object `MB_SearchQueryLog` (data-model.md 3.24; Ops Admin only):

| Field | Type |
|---|---|
| queryText | Text |
| filtersUsed | LongText (JSON) |
| resultCount | Integer |
| source | Picklist `MB_BookingSource` |
| searchedAt | DateTime |

Review weekly:
- Zero-result queries are a guide to new synonyms and to where to recruit hosts.
- Top queries are candidates for pinned results (`search-config.json`), and feed `/search/suggest`.

## 10. Website and app

- **Website hero:** a custom fragment or custom element that calls the orchestrator and routes to a `/search` page.
- **`/search` page:** a results fragment backed by the orchestrator. Liferay's Search Bar, Search Results and facet widgets are an alternative for simple text search; custom facets on object fields depend on the Liferay version.
- **App:** calls the orchestrator for the search box. Category chips and "See all" call the orchestrator too (guests and travelers can't read listings directly, data-model.md 6.2), e.g.
  ```
  /search/trips?category=paragliding&sort=priceAsc
  ```
  Listing and host pages use `/search/listings/{slug}` and `/search/hosts/{handle}`.
- **Autocomplete:** Destination names plus top queries from the log, served by `GET /search/suggest?q=`.

## 11. Testing checklist

- "bir" returns Bir Billing listings; "dharamsala" matches Dharamshala (synonym).
- "paragliding in himachal" returns paragliding listings in Himachal Pradesh.
- "raftng" (typo) still returns rafting.
- A listing awaiting approval never appears.
- Dates with a full slot exclude that listing; 3 travelers on a slot with 2 spots left exclude it.
- Renaming a Destination updates destinationName on its listings.
- Guests can search; results never include Booking, Payment or Traveler data.
