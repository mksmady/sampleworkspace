# mb-search-service

Spring Boot 3.5 / Java 21 microservice client extension: Maddybaba's public trip search (docs/search.md). Liferay Search Blueprints need an LES subscription, so text relevance, synonyms and pinned results run here, over an in-memory copy of what the public may see (approved listings, destinations, approved and active hosts, open slots), refreshed every 60 seconds.

## Endpoints (public, read-only)

- `GET /search/trips` — search (q, category, from, to, travelers, lat, lng, radiusKm, minPrice, maxPrice, sort, page, pageSize, source)
- `GET /search/suggest?q=` — destinations and earlier queries
- `GET /search/listings/{slug}` — public listing page
- `GET /search/hosts/{handle}` — public host profile

Every response is built from the whitelists in `PublicViews`; the service reads Liferay as an administrator, so nothing else may be passed on. Each search is logged to `MB_SearchQueryLog`.

## Run locally

```
gradlew :client-extensions:mb-search-service:deploy    # registers the OAuth2 app with Liferay
gradlew :client-extensions:mb-search-service:bootRun   # http://localhost:58082 (heap capped at 256 MB)
```

## Tuning

`src/main/resources/search-config.json`: synonym sets, pinned results and stop words. Review zero-result queries in `MB_SearchQueryLog` weekly and add synonyms.

`src/main/resources/application-default.properties`:

- `mb.search.catalog-refresh-ms` (60000): how often the catalog copy is reloaded.
- `mb.search.slot-days` (180): how far ahead slots are loaded.
- `mb.search.cors-origins` (http://localhost:8080): browser origins allowed to call the API.
