package com.maddybaba.search;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.json.JSONArray;
import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory copy of what the public may search, refreshed on a fixed delay: approved listings,
 * destinations, approved and active hosts, open slots from today, and query counts from the search log
 * (for suggestions). Listings awaiting approval and inactive hosts never enter it.
 */
@Component
public class Catalog {

	/**
	 * A searchable entry: its JSON (as Liferay returns it) and its words per field.
	 */
	public record Doc(JSONObject json, Map<String, List<String>> words) {
	}

	public record Snapshot(
		List<Doc> listings, List<Doc> destinations, List<Doc> hosts, Map<Long, List<JSONObject>> openSlots,
		Map<String, Integer> queryCounts, Instant loadedAt) {
	}

	public Catalog(LiferayClient liferayClient, @Value("${mb.search.slot-days}") int slotDays) {
		_liferayClient = liferayClient;
		_slotDays = slotDays;
	}

	public Snapshot get() {
		return _snapshot;
	}

	@Scheduled(fixedDelayString = "${mb.search.catalog-refresh-ms}", initialDelay = 0)
	public void refresh() {
		try {
			List<Doc> listings = new ArrayList<>();

			for (JSONObject listing : _liferayClient.getAll("/o/c/listings")) {
				if (_approved(listing)) {
					listings.add(_doc(listing, QueryMatcher.LISTING_FIELDS));
				}
			}

			List<Doc> destinations = new ArrayList<>();

			for (JSONObject destination : _liferayClient.getAll("/o/c/destinations")) {
				destinations.add(_doc(destination, QueryMatcher.DESTINATION_FIELDS));
			}

			List<Doc> hosts = new ArrayList<>();

			for (JSONObject host : _liferayClient.getAll("/o/c/hosts")) {
				if (_approved(host) && "active".equals(key(host.opt("hostStatus")))) {
					hosts.add(_doc(host, QueryMatcher.HOST_FIELDS));
				}
			}

			String today = LocalDate.now(ZoneId.of("Asia/Kolkata")).toString();
			String until = LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(_slotDays).toString();
			Map<Long, List<JSONObject>> openSlots = new HashMap<>();

			for (JSONObject slot : _liferayClient.getAll("/o/c/availabilityslots")) {
				String date = slot.optString("slotDate");

				if ("open".equals(key(slot.opt("slotStatus"))) && (date.length() >= 10) && (date.substring(0, 10).compareTo(today) >= 0) &&
					(date.substring(0, 10).compareTo(until) <= 0)) {

					openSlots.computeIfAbsent(slot.optLong("r_listingSlots_c_listingId"), id -> new ArrayList<>()).add(slot);
				}
			}

			Map<String, Integer> queryCounts = new HashMap<>();

			for (JSONObject log : _liferayClient.getAll("/o/c/searchquerylogs")) {
				String query = Text.normalize(log.optString("queryText"));

				if (!query.isEmpty() && (log.optInt("resultCount") > 0)) {
					queryCounts.merge(query, 1, Integer::sum);
				}
			}

			_snapshot = new Snapshot(listings, destinations, hosts, openSlots, queryCounts, Instant.now());

			_log.info("Catalog: {} listings, {} destinations, {} hosts, {} listings with open slots", listings.size(), destinations.size(), hosts.size(), openSlots.size());
		}
		catch (Exception exception) {
			_log.error("Catalog refresh failed; keeping the previous copy", exception);
		}
	}

	/**
	 * A picklist value's key, whether Liferay returns {"key", "name"} or the key itself.
	 */
	public static String key(Object value) {
		if (value instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return ((value == null) || (value == JSONObject.NULL)) ? "" : value.toString();
	}

	/**
	 * Searchable text of a field: plain values as they are, picklists as key and label, multiselect
	 * picklists as all their keys and labels.
	 */
	public static String text(Object value) {
		if (value instanceof JSONObject jsonObject) {
			return jsonObject.optString("key") + " " + jsonObject.optString("name");
		}

		if (value instanceof JSONArray jsonArray) {
			StringBuilder sb = new StringBuilder();

			for (Object item : jsonArray) {
				sb.append(text(item)).append(' ');
			}

			return sb.toString();
		}

		return ((value == null) || (value == JSONObject.NULL)) ? "" : value.toString();
	}

	private static boolean _approved(JSONObject entry) {
		JSONObject status = entry.optJSONObject("status");

		return (status != null) && (status.optInt("code", -1) == 0);
	}

	private static Doc _doc(JSONObject json, List<QueryMatcher.Field> fields) {
		Map<String, List<String>> words = new HashMap<>();

		for (QueryMatcher.Field field : fields) {
			words.put(field.name(), Text.words(text(json.opt(field.name()))));
		}

		return new Doc(json, words);
	}

	private static final Logger _log = LoggerFactory.getLogger(Catalog.class);

	private final LiferayClient _liferayClient;
	private final int _slotDays;
	private volatile Snapshot _snapshot = new Snapshot(List.of(), List.of(), List.of(), Map.of(), Map.of(), Instant.EPOCH);

}
