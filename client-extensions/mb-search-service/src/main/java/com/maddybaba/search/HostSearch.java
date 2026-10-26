package com.maddybaba.search;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

import org.springframework.stereotype.Component;

/**
 * GET /search/hosts (docs/search.md sections 4, 6, 7 and 8), behind the home page's "Find Local Hosts":
 * host cards from the in-memory catalog, by text relevance (destination, name, specialties, role,
 * quote, bio, with the destination's keywords), filtered by destination, specialty, whole-trip offer,
 * dates and guests (a host is available when at least one of their approved listings is) and price.
 */
@Component
public class HostSearch {

	public HostSearch(Catalog catalog, QueryMatcher queryMatcher) {
		_catalog = catalog;
		_queryMatcher = queryMatcher;
	}

	public JSONObject search(Map<String, String> params) {
		Catalog.Snapshot snapshot = _catalog.get();
		String q = params.getOrDefault("q", "").trim();
		String destination = params.getOrDefault("destination", "").trim();
		String category = params.getOrDefault("category", "").trim();
		boolean fullTrip = "true".equals(params.getOrDefault("fullTrip", ""));
		String guestsParam = TripSearch.guests(params);
		int guests = guestsParam.isBlank() ? 1 : Math.max(1, Integer.parseInt(guestsParam.trim()));
		LocalDate from = TripSearch.dateParam(params.get("from"));
		LocalDate to = (from == null) ? null : ((TripSearch.dateParam(params.get("to")) == null) ? from : TripSearch.dateParam(params.get("to")));
		BigDecimal minPrice = _decimal(params.get("minPrice"));
		BigDecimal maxPrice = _decimal(params.get("maxPrice"));
		String sort = params.getOrDefault("sort", "relevance");
		int page = Math.max(1, _int(params.get("page"), 1));
		int pageSize = Math.min(100, Math.max(1, _int(params.get("pageSize"), 12)));

		if (!List.of("priceAsc", "rating", "relevance").contains(sort)) {
			throw new IllegalArgumentException("Unknown sort " + sort);
		}

		if ((to != null) && to.isBefore(from)) {
			throw new IllegalArgumentException("to is before from");
		}

		long destinationId = -1;

		if (!destination.isEmpty()) {
			for (Catalog.Doc doc : snapshot.destinations()) {
				if (doc.json().optString("slug").equals(destination)) {
					destinationId = doc.json().getLong("id");
				}
			}
		}

		List<QueryMatcher.Concept> concepts = _queryMatcher.concepts(q);
		List<Hit> hits = new ArrayList<>();

		for (Catalog.Doc doc : snapshot.hosts()) {
			JSONObject host = doc.json();

			if (!destination.isEmpty() && (host.optLong("r_destinationHosts_c_destinationId") != destinationId)) {
				continue;
			}

			List<String> specialties = _keys(host.optJSONArray("specialties"));
			boolean offersFullTrip = _keys(host.optJSONArray("hostOffers")).contains("fullTrip");

			if ((!category.isEmpty() && !specialties.contains(category)) || (fullTrip && !offersFullTrip)) {
				continue;
			}

			double score = concepts.isEmpty() ? 1 : _queryMatcher.score(concepts, QueryMatcher.HOST_FIELDS, doc.words());

			if (score < 0) {
				continue;
			}

			score *= offersFullTrip ? 1.3 : 1;
			score *= (_number(host.opt("ratingValue")) >= 4.5) ? 1.2 : 1;

			JSONObject price = _price(snapshot, host, from, to, guests);

			if ((from != null) && (price == null)) {
				continue;
			}

			BigDecimal amount = (price == null) ? null : new BigDecimal(price.get("amount").toString());

			if (((minPrice != null) || (maxPrice != null)) &&
				((amount == null) || ((minPrice != null) && (amount.compareTo(minPrice) < 0)) || ((maxPrice != null) && (amount.compareTo(maxPrice) > 0)))) {

				continue;
			}

			hits.add(new Hit(doc, score, price, amount));
		}

		hits.sort(_comparator(sort));

		String pinned = "relevance".equals(sort) ? _queryMatcher.pinned("hosts", q) : null;

		if (pinned != null) {
			for (int i = 0; i < hits.size(); i++) {
				if (pinned.equals(hits.get(i).doc().json().optString("externalReferenceCode"))) {
					hits.add(0, hits.remove(i));

					break;
				}
			}
		}

		return _response(params, hits, page, pageSize, snapshot, concepts);
	}

	private record Hit(Catalog.Doc doc, double score, JSONObject price, BigDecimal amount) {
	}

	private static Comparator<Hit> _comparator(String sort) {
		Comparator<Hit> byRating = Comparator.comparingDouble(hit -> -_number(hit.doc().json().opt("ratingValue")));
		Comparator<Hit> byReviews = Comparator.comparingInt(hit -> -hit.doc().json().optInt("reviewCount"));

		return switch (sort) {
			case "priceAsc" -> Comparator.comparing(Hit::amount, Comparator.nullsLast(Comparator.naturalOrder()));
			case "rating" -> byRating.thenComparing(byReviews);
			default -> Comparator.comparingDouble(Hit::score).reversed().thenComparing(byRating).thenComparing(byReviews);
		};
	}

	private static BigDecimal _decimal(String value) {
		return ((value == null) || value.isBlank()) ? null : new BigDecimal(value.trim());
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

	private static List<String> _keys(JSONArray picklistValues) {
		List<String> keys = new ArrayList<>();

		for (int i = 0; (picklistValues != null) && (i < picklistValues.length()); i++) {
			keys.add(Catalog.key(picklistValues.opt(i)));
		}

		return keys;
	}

	private static double _number(Object value) {
		try {
			return ((value == null) || (value == JSONObject.NULL) || "".equals(value.toString())) ? 0 : Double.parseDouble(value.toString());
		}
		catch (NumberFormatException numberFormatException) {
			return 0;
		}
	}

	/**
	 * The card's price line. Without dates: the stored completeTripsFrom, else priceFrom (as on the
	 * card). With dates: the lowest effective price among the host's listings available then, complete
	 * trips first; null when none is available. availableListingCount says how many are.
	 */
	private static JSONObject _price(Catalog.Snapshot snapshot, JSONObject host, LocalDate from, LocalDate to, int guests) {
		if (from == null) {
			JSONObject card = PublicViews.host(host);

			return card.isNull("price") ? null : card.getJSONObject("price");
		}

		BigDecimal completeTrips = null;
		BigDecimal others = null;
		int available = 0;

		for (Catalog.Doc doc : snapshot.listings()) {
			JSONObject listing = doc.json();

			if (listing.optLong("r_hostListings_c_hostId") != host.getLong("id")) {
				continue;
			}

			BigDecimal lowest = null;

			for (JSONObject slot : TripSearch.availableSlots(snapshot, listing, from, to, guests)) {
				BigDecimal slotPrice = TripSearch.slotPrice(slot, listing);

				lowest = ((lowest == null) || (slotPrice.compareTo(lowest) < 0)) ? slotPrice : lowest;
			}

			if (lowest == null) {
				continue;
			}

			available++;

			if ("completeTrip".equals(Catalog.key(listing.opt("category")))) {
				completeTrips = ((completeTrips == null) || (lowest.compareTo(completeTrips) < 0)) ? lowest : completeTrips;
			}
			else {
				others = ((others == null) || (lowest.compareTo(others) < 0)) ? lowest : others;
			}
		}

		if (available == 0) {
			return null;
		}

		return new JSONObject(
		).put(
			"amount", (completeTrips != null) ? completeTrips : others
		).put(
			"availableListingCount", available
		).put(
			"currency", "INR"
		).put(
			"label", (completeTrips != null) ? "completeTripsFrom" : "priceFrom"
		);
	}

	private JSONObject _response(
		Map<String, String> params, List<Hit> hits, int page, int pageSize, Catalog.Snapshot snapshot, List<QueryMatcher.Concept> concepts) {

		Map<String, String> specialtyLabels = new HashMap<>();
		Map<String, Integer> specialtyCounts = new LinkedHashMap<>();
		Map<String, String> roleLabels = new HashMap<>();
		Map<String, Integer> roleCounts = new LinkedHashMap<>();
		JSONArray items = new JSONArray();

		for (Hit hit : hits) {
			JSONArray specialties = hit.doc().json().optJSONArray("specialties");

			for (int i = 0; (specialties != null) && (i < specialties.length()); i++) {
				JSONObject specialty = specialties.optJSONObject(i);

				if (specialty != null) {
					specialtyLabels.put(specialty.optString("key"), specialty.optString("name"));
					specialtyCounts.merge(specialty.optString("key"), 1, Integer::sum);
				}
			}

			JSONObject role = hit.doc().json().optJSONObject("hostRole");

			if (role != null) {
				roleLabels.put(role.optString("key"), role.optString("name"));
				roleCounts.merge(role.optString("key"), 1, Integer::sum);
			}
		}

		for (Hit hit : hits.subList(Math.min(hits.size(), (page - 1) * pageSize), Math.min(hits.size(), page * pageSize))) {
			JSONObject card = PublicViews.host(hit.doc().json());

			card.put("price", (hit.price() == null) ? JSONObject.NULL : hit.price());

			if (hit.price() != null) {
				card.put("availableListingCount", hit.price().optInt("availableListingCount", 0));
				hit.price().remove("availableListingCount");
			}

			items.put(card);
		}

		JSONArray destinations = new JSONArray();

		if (!concepts.isEmpty()) {
			for (Catalog.Doc destination : snapshot.destinations()) {
				if (_queryMatcher.score(concepts, QueryMatcher.DESTINATION_FIELDS, destination.words()) > 0) {
					destinations.put(PublicViews.destination(destination.json()));
				}
			}
		}

		JSONObject query = new JSONObject();

		for (String name : List.of("q", "destination", "category", "fullTrip", "from", "to", "guests", "minPrice", "maxPrice", "sort")) {
			String value = "guests".equals(name) ? TripSearch.guests(params) : params.getOrDefault(name, "");

			if (!value.isEmpty()) {
				query.put(name, value);
			}
		}

		return new JSONObject(
		).put(
			"destinations", destinations
		).put(
			"facets", new JSONObject().put("hostRole", _facet(roleLabels, roleCounts)).put("specialties", _facet(specialtyLabels, specialtyCounts))
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

	private final Catalog _catalog;
	private final QueryMatcher _queryMatcher;

}
