# Maddybaba – Search Design

How travelers find listings, destinations and hosts on the website and app.
Depends on the objects in `docs/data-model.md`.

## 1. Overview

The hero search has four inputs (Where to, Dates, Travelers, Looking for), and the app has a single search box with category chips. Search is split into three layers:

1. **Indexed text search** over Listing, Destination and Host, using Liferay search (Elasticsearch/OpenSearch).
2. **Availability filtering** over AvailabilitySlot, for dates and traveler count.
3. **A search orchestrator** microservice client extension (`GET /search/trips`) that combines both, adds flight results, and returns one response shape to web and app.

Guests and travelers have no direct View on Listing or Host (data-model.md section 6.2): Liferay would also show listings awaiting approval, and Host holds private fields. So every public list of listings or hosts (category pages, "See all", listing detail, host profile) goes through `mb-search-service`, which reads with its own OAuth2 identity and returns only approved listings, active hosts and public fields. A host's own listings (host dashboard) can call the headless APIs directly.

## 2. What is searchable

| Object | In public search | Title field | Searchable fields |
|---|---|---|---|
| Listing | Yes | title | title, shortDescription, description, category, destinationName, stateName, region, hostDisplayName, searchKeywords |
| Destination | Yes | name | name, state, region, description, searchKeywords |
| Host | Yes (active only) | displayName | displayName, hostRegion, bio |
| All others | No | | Keep indexed for admin lookup, but exclude from site search widgets and Blueprints |

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

## 4. Relevance (Search Blueprint `MB_TripSearch`)

**Query.** Multi-match with these boosts:

| Field | Boost |
|---|---|
| title | 5 |
| destinationName | 4 |
| searchKeywords | 3 |
| region, stateName | 2 |
| shortDescription, hostDisplayName | 1.5 |
| description | 1 |

Enable fuzziness `AUTO` on title, destinationName and searchKeywords.

**Filters (always applied).**
- Object definition in (Listing, Destination, Host)
- Workflow status = approved
- `hostStatus` = active

**Boosts.**
- `isFeatured = true` ×2
- `isTrending = true` ×1.5
- `seasonMonths` contains the current month ×1.5
- `ratingValue ≥ 4.5` ×1.2

**Result Rankings.** Pin the flagship listing for the query "paragliding" to the top (managed in Search Tuning).

## 5. Synonym sets

Create these in Search Tuning → Synonyms:

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
| Where to | `q` | Full-text via Blueprint. Typeahead suggestions from Destination.name |
| Looking for | `category` | Filter `category` = picklist key. The app's filter chips use the same parameter |
| Travelers | `travelers` | Filter `maxGuests ≥ travelers` (listings with no maxGuests pass) |
| Dates | `from`, `to` | Availability step (section 7) |
| Near you | `lat`, `lng`, `radiusKm` | Bounding-box filter on latitude/longitude, then Haversine distance sort in the orchestrator |
| Price | `minPrice`, `maxPrice` | Range filter on basePrice |
| Sort | `sort` | relevance (default), priceAsc, priceDesc, rating, distance |

Object fields are not indexed as geo-points, so true geo-distance queries are out of scope for now. If location search becomes central, sync Listings to a dedicated index with a `geo_point` field.

## 7. Availability step

1. Run the text search with all filters except dates, and get the candidate listing IDs (up to 200).
2. Query AvailabilitySlot for those IDs with `slotDate` between `from` and `to` and `slotStatus = open`.
3. Keep a listing if at least one slot has `capacity − bookedCount ≥ travelers`. Stay listings need a slot on every night in the range.
4. Attach the matching dates and the effective price (`priceOverride` or `basePrice`) to each result.

Without `from` and `to`, skip this step and return `nextAvailableDate` instead.

## 8. Orchestrator API — `GET /search/trips`

Implemented as a microservice client extension, secured with OAuth2. Guests may call it.

### Request
```
GET /search/trips?q=bir&category=paragliding&from=2026-10-02&to=2026-10-04&travelers=2&lat=28.61&lng=77.20&radiusKm=500&minPrice=&maxPrice=&sort=relevance&page=1&pageSize=20
```

All parameters are optional. `category` = flight routes the query to the flight supplier (see data-model.md section 8.1). With no category, include up to three flight options when `q` resolves to a destination with an airport.

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

If Liferay Analytics Cloud is not used, create an object `MB_SearchQueryLog` with:

| Field | Type |
|---|---|
| queryText | Text |
| filtersUsed | LongText (JSON) |
| resultCount | Integer |
| source | Picklist `MB_BookingSource` |
| searchedAt | DateTime |

Review weekly:
- Zero-result queries are a guide to new synonyms and to where to recruit hosts.
- Top queries are candidates for Result Rankings.

## 10. Website and app

- **Website hero:** a custom fragment or custom element that calls the orchestrator and routes to a `/search` page.
- **`/search` page:** a results fragment backed by the orchestrator. Liferay's Search Bar, Search Results and facet widgets are an alternative for simple text search; custom facets on object fields depend on the Liferay version.
- **App:** calls the orchestrator for the search box. Category chips and "See all" call the headless API directly, e.g.
  ```
  /o/c/listings?filter=category eq 'paragliding'&sort=basePrice:asc&nestedFields=listingInclusions
  ```
- **Autocomplete:** Destination names plus top queries from the log, served by `GET /search/suggest?q=`.

## 11. Testing checklist

- "bir" returns Bir Billing listings; "dharamsala" matches Dharamshala (synonym).
- "paragliding in himachal" returns paragliding listings in Himachal Pradesh.
- "raftng" (typo) still returns rafting.
- A listing awaiting approval never appears.
- Dates with a full slot exclude that listing; 3 travelers on a slot with 2 spots left exclude it.
- Renaming a Destination updates destinationName on its listings.
- Guests can search; results never include Booking, Payment or Traveler data.
