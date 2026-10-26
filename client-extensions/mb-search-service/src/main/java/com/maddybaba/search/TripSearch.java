package com.maddybaba.search;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.json.JSONArray;
import org.json.JSONObject;

import org.springframework.stereotype.Component;

/**
 * GET /search/trips (docs/search.md sections 4, 6, 7 and 8) over the in-memory catalog:
 * text relevance with synonyms, typo tolerance and all-words matching; boosts for featured, trending,
 * in-season and well-rated listings; filters (category, travelers, price, distance); availability
 * for dates and travelers; facets, sorting, pinned results and pages. Also suggestions and the public
 * listing and host pages.
 */
@Component
public class TripSearch {

	public TripSearch(Catalog catalog, LiferayClient liferayClient, QueryMatcher queryMatcher) {
		_catalog = catalog;
		_liferayClient = liferayClient;
		_queryMatcher = queryMatcher;
	}

	/**
	 * GET /search/hosts/{handle}: the public host fields, their approved listings (complete trips
	 * first, then by price) and their published reviews (newest first).
	 */
	public JSONObject host(String handle) {
		Catalog.Snapshot snapshot = _catalog.get();

		for (Catalog.Doc host : snapshot.hosts()) {
			if (!host.json().optString("handle").equals(handle)) {
				continue;
			}

			long hostId = host.json().getLong("id");
			JSONArray listings = new JSONArray();

			snapshot.listings(
			).stream(
			).map(
				Catalog.Doc::json
			).filter(
				listing -> listing.optLong("r_hostListings_c_hostId") == hostId
			).sorted(
				Comparator.comparing(
					(JSONObject listing) -> !"completeTrip".equals(Catalog.key(listing.opt("category")))
				).thenComparing(
					listing -> _decimalValue(listing.opt("basePrice"))
				)
			).forEach(
				listing -> listings.put(_withHost(PublicViews.listing(listing), snapshot))
			);

			JSONArray reviews = new JSONArray();

			for (JSONObject review : snapshot.publishedReviews().getOrDefault(hostId, List.of())) {
				reviews.put(PublicViews.review(review));
			}

			return PublicViews.host(host.json()).put("listings", listings).put("reviews", reviews);
		}

		return null;
	}

	public JSONObject listing(String slug) {
		Catalog.Snapshot snapshot = _catalog.get();

		for (Catalog.Doc listing : snapshot.listings()) {
			if (!listing.json().optString("slug").equals(slug)) {
				continue;
			}

			long id = listing.json().getLong("id");
			JSONArray inclusions = new JSONArray();

			for (JSONObject inclusion : _liferayClient.getAll("/o/c/listinginclusions?filter=r_listingInclusions_c_listingId eq '" + id + "'&sort=sortOrder:asc")) {
				inclusions.put(
					new JSONObject(
					).put(
						"addOnPrice", inclusion.opt("addOnPrice")
					).put(
						"inclusionType", Catalog.key(inclusion.opt("inclusionType"))
					).put(
						"label", inclusion.optString("label")
					));
			}

			JSONArray slots = new JSONArray();
			String until = _today().plusDays(30).toString();

			for (JSONObject slot : _sortedSlots(snapshot, id)) {
				if (_date(slot).compareTo(until) <= 0) {
					slots.put(
						new JSONObject(
						).put(
							"date", _date(slot)
						).put(
							"placesLeft", _placesLeft(slot)
						).put(
							"price", slotPrice(slot, listing.json())
						).put(
							"startTime", slot.optString("startTime")
						));
				}
			}

			JSONObject view = _withHost(PublicViews.listing(listing.json()), snapshot).put("description", listing.json().optString("description")).put("inclusions", inclusions).put("slots", slots);

			for (Catalog.Doc host : snapshot.hosts()) {
				if (host.json().getLong("id") == listing.json().optLong("r_hostListings_c_hostId")) {
					view.put("host", PublicViews.host(host.json()));
				}
			}

			return view;
		}

		return null;
	}

	public JSONObject search(Map<String, String> params) {
		Catalog.Snapshot snapshot = _catalog.get();
		String q = params.getOrDefault("q", "").trim();
		String category = params.getOrDefault("category", "");
		String guestsParam = guests(params);
		boolean travelersGiven = !guestsParam.isEmpty();
		int travelers = Math.max(1, _int(guestsParam, 1));
		LocalDate from = dateParam(params.get("from"));
		LocalDate to = (from == null) ? null : ((dateParam(params.get("to")) == null) ? from : dateParam(params.get("to")));
		Double lat = _double(params.get("lat"));
		Double lng = _double(params.get("lng"));
		Double radiusKm = _double(params.get("radiusKm"));
		BigDecimal minPrice = _decimal(params.get("minPrice"));
		BigDecimal maxPrice = _decimal(params.get("maxPrice"));
		String sort = params.getOrDefault("sort", "relevance");
		int page = Math.max(1, _int(params.get("page"), 1));
		int pageSize = Math.min(100, Math.max(1, _int(params.get("pageSize"), 20)));

		if ((to != null) && to.isBefore(from)) {
			throw new IllegalArgumentException("to is before from");
		}

		List<QueryMatcher.Concept> concepts = _queryMatcher.concepts(q);
		String month = _today().getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH).toLowerCase(Locale.ENGLISH);
		List<Hit> anyCategory = new ArrayList<>();

		for (Catalog.Doc doc : snapshot.listings()) {
			JSONObject json = doc.json();
			double score = concepts.isEmpty() ? 1 : _queryMatcher.score(concepts, QueryMatcher.LISTING_FIELDS, doc.words());

			if (score < 0) {
				continue;
			}

			score *= json.optBoolean("isFeatured") ? 2 : 1;
			score *= json.optBoolean("isTrending") ? 1.5 : 1;
			score *= _keys(json.optJSONArray("seasonMonths")).contains(month) ? 1.5 : 1;
			score *= (_number(json.opt("ratingValue")) >= 4.5) ? 1.2 : 1;

			int maxGuests = json.optInt("maxGuests", 0);

			if (travelersGiven && (maxGuests > 0) && (maxGuests < travelers)) {
				continue;
			}

			Double distanceKm = null;

			if ((lat != null) && (lng != null) && !"".equals(json.optString("latitude"))) {
				distanceKm = _distanceKm(lat, lng, json.getDouble("latitude"), json.getDouble("longitude"));
			}

			if ((radiusKm != null) && ((distanceKm == null) || (distanceKm > radiusKm))) {
				continue;
			}

			List<String> availableDates = null;
			BigDecimal price = _decimalValue(json.opt("basePrice"));

			if (from != null) {
				List<JSONObject> slots = availableSlots(snapshot, json, from, to, travelers);

				if (slots.isEmpty()) {
					continue;
				}

				availableDates = new ArrayList<>();
				price = null;

				for (JSONObject slot : slots) {
					availableDates.add(_date(slot));

					BigDecimal slotPrice = slotPrice(slot, json);

					price = ((price == null) || (slotPrice.compareTo(price) < 0)) ? slotPrice : price;
				}
			}

			if (((minPrice != null) && (price.compareTo(minPrice) < 0)) || ((maxPrice != null) && (price.compareTo(maxPrice) > 0))) {
				continue;
			}

			anyCategory.add(new Hit(doc, score, availableDates, price, distanceKm));
		}

		List<Hit> hits = new ArrayList<>();

		for (Hit hit : anyCategory) {
			if (category.isEmpty() || category.equals(Catalog.key(hit.doc().json().opt("category")))) {
				hits.add(hit);
			}
		}

		hits.sort(_comparator(sort));

		String pinned = "relevance".equals(sort) ? _queryMatcher.pinned("trips", q) : null;

		if (pinned != null) {
			for (int i = 0; i < hits.size(); i++) {
				if (pinned.equals(hits.get(i).doc().json().optString("externalReferenceCode"))) {
					hits.add(0, hits.remove(i));

					break;
				}
			}
		}

		return _response(params, q, hits, anyCategory, page, pageSize, snapshot, concepts);
	}

	/**
	 * GET /search/suggest: destination names that start with (or fuzzily match) the words typed so
	 * far, then earlier queries with results, most frequent first.
	 */
	public JSONObject suggest(String q) {
		String normalized = Text.normalize(q);
		JSONArray suggestions = new JSONArray();

		if (normalized.length() < 2) {
			return new JSONObject().put("items", suggestions);
		}

		List<QueryMatcher.Concept> concepts = _queryMatcher.concepts(q);
		List<Map.Entry<Double, JSONObject>> destinations = new ArrayList<>();

		for (Catalog.Doc destination : _catalog.get().destinations()) {
			double score = _queryMatcher.score(concepts, List.of(QueryMatcher.DESTINATION_FIELDS.get(0), QueryMatcher.DESTINATION_FIELDS.get(1)), destination.words());

			if (score > 0) {
				destinations.add(Map.entry(score, new JSONObject().put("slug", destination.json().optString("slug")).put("text", destination.json().optString("name")).put("type", "destination")));
			}
		}

		destinations.sort(Map.Entry.<Double, JSONObject>comparingByKey().reversed());
		destinations.stream().limit(5).forEach(entry -> suggestions.put(entry.getValue()));

		_catalog.get().queryCounts().entrySet().stream(
		).filter(
			entry -> entry.getKey().startsWith(normalized) && !entry.getKey().equals(normalized)
		).sorted(
			Map.Entry.<String, Integer>comparingByValue().reversed()
		).limit(
			5
		).forEach(
			entry -> suggestions.put(new JSONObject().put("count", entry.getValue()).put("text", entry.getKey()).put("type", "query"))
		);

		return new JSONObject().put("items", suggestions);
	}

	/**
	 * Open slots in the date range with places for the travelers. Stays, homestays and camps need one for
	 * every night (from up to the day before to; a single night when from equals to); anything else,
	 * including a complete trip (a slot per start date), needs at least one day in the range.
	 */
	static List<JSONObject> availableSlots(Catalog.Snapshot snapshot, JSONObject listing, LocalDate from, LocalDate to, int travelers) {
		boolean nightly = _NIGHTLY.contains(Catalog.key(listing.opt("category")));
		LocalDate last = (nightly && to.isAfter(from)) ? to.minusDays(1) : to;
		Map<String, JSONObject> byDate = new LinkedHashMap<>();

		for (JSONObject slot : _sortedSlots(snapshot, listing.getLong("id"))) {
			String date = _date(slot);

			if ((date.compareTo(from.toString()) >= 0) && (date.compareTo(last.toString()) <= 0) && (_placesLeft(slot) >= travelers)) {
				byDate.putIfAbsent(date, slot);
			}
		}

		if (nightly) {
			for (LocalDate night = from; !night.isAfter(last); night = night.plusDays(1)) {
				if (!byDate.containsKey(night.toString())) {
					return List.of();
				}
			}
		}

		return new ArrayList<>(byDate.values());
	}

	/**
	 * The guest count: "guests" (the website's hero) or its older name "travelers"; "" when neither.
	 */
	static String guests(Map<String, String> params) {
		String guests = params.getOrDefault("guests", "");

		return guests.isBlank() ? params.getOrDefault("travelers", "") : guests;
	}

	static LocalDate dateParam(String value) {
		return ((value == null) || value.isBlank()) ? null : LocalDate.parse(value.trim());
	}

	static BigDecimal slotPrice(JSONObject slot, JSONObject listing) {
		Object override = slot.opt("priceOverride");

		return ((override == null) || (override == JSONObject.NULL) || "".equals(override.toString()) || (Double.parseDouble(override.toString()) <= 0))
			? _decimalValue(listing.opt("basePrice")) : new BigDecimal(override.toString());
	}

	private record Hit(Catalog.Doc doc, double score, List<String> availableDates, BigDecimal price, Double distanceKm) {
	}

	private static Comparator<Hit> _comparator(String sort) {
		Comparator<Hit> byRating = Comparator.comparingDouble(hit -> -_number(hit.doc().json().opt("ratingValue")));

		return switch (sort) {
			case "priceAsc" -> Comparator.comparing(Hit::price);
			case "priceDesc" -> Comparator.comparing(Hit::price).reversed();
			case "rating" -> byRating.thenComparing(Comparator.comparingDouble(Hit::score).reversed());
			case "distance" -> Comparator.comparing(hit -> (hit.distanceKm() == null) ? Double.MAX_VALUE : hit.distanceKm());
			case "relevance" -> Comparator.comparingDouble(Hit::score).reversed().thenComparing(byRating);
			default -> throw new IllegalArgumentException("Unknown sort " + sort);
		};
	}

	private static String _date(JSONObject slot) {
		String date = slot.optString("slotDate");

		return (date.length() >= 10) ? date.substring(0, 10) : date;
	}

	private static BigDecimal _decimal(String value) {
		return ((value == null) || value.isBlank()) ? null : new BigDecimal(value.trim());
	}

	private static BigDecimal _decimalValue(Object value) {
		return ((value == null) || (value == JSONObject.NULL) || "".equals(value.toString())) ? BigDecimal.ZERO : new BigDecimal(value.toString());
	}

	private static double _distanceKm(double lat1, double lon1, double lat2, double lon2) {
		double dLat = Math.toRadians(lat2 - lat1);
		double dLon = Math.toRadians(lon2 - lon1);
		double a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLon / 2), 2);

		return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	private static Double _double(String value) {
		return ((value == null) || value.isBlank()) ? null : Double.valueOf(value.trim());
	}

	private static JSONArray _facet(Map<String, String> labels, Map<String, Integer> counts) {
		JSONArray facet = new JSONArray();

		counts.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed()).forEach(
			entry -> facet.put(new JSONObject().put("count", entry.getValue()).put("key", entry.getKey()).put("label", labels.get(entry.getKey()))));

		return facet;
	}

	private static int _int(String value, int fallback) {
		return ((value == null) || value.isBlank()) ? fallback : Integer.parseInt(value.trim());
	}

	private static Set<String> _keys(JSONArray picklistValues) {
		Set<String> keys = new TreeSet<>();

		for (int i = 0; (picklistValues != null) && (i < picklistValues.length()); i++) {
			keys.add(Catalog.key(picklistValues.opt(i)));
		}

		return keys;
	}

	/**
	 * Top matching entries of a secondary list (destinations, hosts), by score.
	 */
	private JSONArray _matches(List<Catalog.Doc> docs, List<QueryMatcher.Field> fields, List<QueryMatcher.Concept> concepts, boolean hosts) {
		JSONArray matches = new JSONArray();

		if (concepts.isEmpty()) {
			return matches;
		}

		List<Map.Entry<Double, Catalog.Doc>> scored = new ArrayList<>();

		for (Catalog.Doc doc : docs) {
			double score = _queryMatcher.score(concepts, fields, doc.words());

			if (score > 0) {
				scored.add(Map.entry(score, doc));
			}
		}

		scored.sort(Map.Entry.<Double, Catalog.Doc>comparingByKey().reversed());
		scored.stream().limit(5).forEach(
			entry -> matches.put(hosts ? PublicViews.host(entry.getValue().json()) : PublicViews.destination(entry.getValue().json())));

		return matches;
	}

	private static double _number(Object value) {
		return ((value == null) || (value == JSONObject.NULL) || "".equals(value.toString())) ? 0 : Double.parseDouble(value.toString());
	}

	private static long _placesLeft(JSONObject slot) {
		return slot.optLong("capacity") - (long)_number(slot.opt("bookedCount"));
	}

	private JSONObject _response(
		Map<String, String> params, String q, List<Hit> hits, List<Hit> anyCategory, int page, int pageSize, Catalog.Snapshot snapshot,
		List<QueryMatcher.Concept> concepts) {

		Map<String, String> categoryLabels = new HashMap<>();
		Map<String, Integer> categoryCounts = new LinkedHashMap<>();

		for (Hit hit : anyCategory) {
			JSONObject category = hit.doc().json().optJSONObject("category");

			if (category != null) {
				categoryLabels.put(category.optString("key"), category.optString("name"));
				categoryCounts.merge(category.optString("key"), 1, Integer::sum);
			}
		}

		Map<String, String> stateKeys = new HashMap<>();

		for (Catalog.Doc destination : snapshot.destinations()) {
			JSONObject state = destination.json().optJSONObject("state");

			if (state != null) {
				stateKeys.put(state.optString("name"), state.optString("key"));
			}
		}

		Map<String, String> stateLabels = new HashMap<>();
		Map<String, Integer> stateCounts = new LinkedHashMap<>();

		for (Hit hit : hits) {
			String label = hit.doc().json().optString("stateName");

			if (!label.isEmpty()) {
				String key = stateKeys.getOrDefault(label, label);

				stateLabels.put(key, label);
				stateCounts.merge(key, 1, Integer::sum);
			}
		}

		JSONArray items = new JSONArray();

		for (Hit hit : hits.subList(Math.min(hits.size(), (page - 1) * pageSize), Math.min(hits.size(), page * pageSize))) {
			JSONObject item = _withHost(PublicViews.listing(hit.doc().json()), snapshot);

			item.getJSONObject("price").put("amount", hit.price());

			if (hit.availableDates() != null) {
				item.put("availableDates", new JSONArray(hit.availableDates()));
			}

			if (hit.distanceKm() != null) {
				item.put("distanceKm", Math.round(hit.distanceKm()));
			}

			items.put(item);
		}

		JSONObject query = new JSONObject();

		for (String name : List.of("q", "category", "from", "to", "guests", "travelers", "lat", "lng", "radiusKm", "minPrice", "maxPrice", "sort")) {
			if (!params.getOrDefault(name, "").isEmpty()) {
				query.put(name, params.get(name));
			}
		}

		return new JSONObject(
		).put(
			"destinations", _matches(snapshot.destinations(), QueryMatcher.DESTINATION_FIELDS, concepts, false)
		).put(
			"facets", new JSONObject().put("category", _facet(categoryLabels, categoryCounts)).put("state", _facet(stateLabels, stateCounts))
		).put(
			"hosts", _matches(snapshot.hosts(), QueryMatcher.HOST_FIELDS, concepts, true)
		).put(
			"items", items
		).put(
			"page", page
		).put(
			"pageSize", pageSize
		).put(
			"query", query
		).put(
			"totalCount", hits.size()
		);
	}

	private static List<JSONObject> _sortedSlots(Catalog.Snapshot snapshot, long listingId) {
		List<JSONObject> slots = new ArrayList<>(snapshot.openSlots().getOrDefault(listingId, List.of()));

		slots.sort(Comparator.comparing(TripSearch::_date));

		return slots;
	}

	private static LocalDate _today() {
		return LocalDate.now(ZoneId.of("Asia/Kolkata"));
	}

	/**
	 * Adds the listing's host link: {handle, displayName}, or null when the host isn't public.
	 */
	private static JSONObject _withHost(JSONObject view, Catalog.Snapshot snapshot) {
		long hostId = -1;

		for (Catalog.Doc listing : snapshot.listings()) {
			if (listing.json().getLong("id") == view.getLong("id")) {
				hostId = listing.json().optLong("r_hostListings_c_hostId");
			}
		}

		for (Catalog.Doc host : snapshot.hosts()) {
			if (host.json().getLong("id") == hostId) {
				return view.put("host", new JSONObject().put("displayName", host.json().optString("displayName")).put("handle", host.json().optString("handle")));
			}
		}

		return view.put("host", JSONObject.NULL);
	}

	private static final Set<String> _NIGHTLY = Set.of("camping", "homestay", "stay");

	private final Catalog _catalog;
	private final LiferayClient _liferayClient;
	private final QueryMatcher _queryMatcher;

}
