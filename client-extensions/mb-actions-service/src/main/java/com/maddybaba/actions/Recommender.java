package com.maddybaba.actions;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.json.JSONArray;
import org.json.JSONObject;


import org.springframework.stereotype.Component;

/**
 * Nightly recommendations per traveler (docs/data-model.md 7.3), each section only when its factor is
 * enabled on the traveler (useFactor*), at most three per section:
 * - placesNow (monthSeason, weather): destinations at their best this month; trending and good weather
 *   this week score higher.
 * - longWeekend (publicHolidays): the next long weekend within 60 days, with destinations at their best
 *   that month.
 * - hostsForYou (pastTravel): active hosts whose specialties match the categories of completed trips.
 * - nearYou (currentLocation): destinations within 300 km with availability in the next 7 days.
 * Entries are upserted by ERC (MB_reco_<traveler>_<section>_<target>) and expire after 36 hours; expired
 * ones are deleted, so recommendations that no longer apply disappear by the next run.
 */
@Component
public class Recommender {

	public Recommender(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	public int refresh() {
		LocalDate today = LocalDate.now(_IST);
		Context context = new Context(
			today, _liferayClient.getAll("/o/c/destinations"), _goodWeatherDays(today), _liferayClient.getAll("/o/c/hosts"),
			_liferayClient.getAll("/o/c/listings"), _nextLongWeekend(today));

		int stored = 0;

		for (JSONObject traveler : _liferayClient.getAll("/o/c/travelers")) {
			List<Recommendation> recommendations = new ArrayList<>();

			if (traveler.optBoolean("useFactorSeason", true)) {
				recommendations.addAll(_placesNow(context, traveler.optBoolean("useFactorWeather", true)));
			}

			if (traveler.optBoolean("useFactorHolidays", true)) {
				recommendations.addAll(_longWeekend(context));
			}

			if (traveler.optBoolean("useFactorPastTravel", true)) {
				recommendations.addAll(_hostsForYou(context, traveler.getLong("id")));
			}

			if (traveler.optBoolean("useFactorLocation", false)) {
				recommendations.addAll(_nearYou(context, traveler));
			}

			Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);

			for (Recommendation recommendation : recommendations) {
				JSONObject entry = new JSONObject(
				).put(
					"expiresAt", now.plus(36, ChronoUnit.HOURS).toString()
				).put(
					"factorsUsed", new JSONArray(recommendation.factors().stream().map(factor -> new JSONObject().put("key", factor)).toList())
				).put(
					"generatedAt", now.toString()
				).put(
					"reasonText", recommendation.reason()
				).put(
					"r_travelerRecommendations_c_travelerId", traveler.getLong("id")
				).put(
					"score", recommendation.score()
				).put(
					"section", recommendation.section()
				).put(
					recommendation.relationshipField(), recommendation.targetId()
				);

				_liferayClient.upsert(
					"recommendations",
					"MB_reco_" + traveler.getLong("id") + "_" + recommendation.section() + "_" + recommendation.targetId(), entry);

				stored++;
			}
		}

		for (JSONObject recommendation : _liferayClient.getAll("/o/c/recommendations")) {
			String expiresAt = recommendation.optString("expiresAt");

			if (!expiresAt.isEmpty() && Instant.parse(expiresAt).isBefore(Instant.now())) {
				_liferayClient.delete("/o/c/recommendations/" + recommendation.getLong("id"));
			}
		}

		return stored;
	}

	private static boolean _approved(JSONObject entry) {
		JSONObject status = entry.optJSONObject("status");

		return (status != null) && (status.optInt("code", -1) == 0);
	}

	private static boolean _bestIn(JSONObject destination, String month) {
		return _keys(destination.optJSONArray("bestMonths")).contains(month);
	}

	private static double _distanceKm(double lat1, double lon1, double lat2, double lon2) {
		double dLat = Math.toRadians(lat2 - lat1);
		double dLon = Math.toRadians(lon2 - lon1);
		double a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLon / 2), 2);

		return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	/**
	 * Days with isGoodForActivity in the coming week, per destination ID.
	 */
	private Map<Long, Integer> _goodWeatherDays(LocalDate today) {
		Map<Long, Integer> days = new HashMap<>();
		String from = today.toString();
		String to = today.plusDays(6).toString();

		for (JSONObject snapshot : _liferayClient.getAll("/o/c/weathersnapshots")) {
			String date = snapshot.optString("forecastDate");

			if ((date.length() >= 10) && (date.substring(0, 10).compareTo(from) >= 0) && (date.substring(0, 10).compareTo(to) <= 0) &&
				snapshot.optBoolean("isGoodForActivity")) {

				days.merge(snapshot.optLong("r_destinationWeather_c_destinationId"), 1, Integer::sum);
			}
		}

		return days;
	}

	private List<Recommendation> _hostsForYou(Context context, long travelerId) {
		Set<String> categories = new LinkedHashSet<>();

		for (JSONObject booking : _liferayClient.getAll("/o/c/bookings?filter=r_travelerBookings_c_travelerId eq '" + travelerId + "'")) {
			if (!"completed".equals(_key(booking.opt("bookingStatus")))) {
				continue;
			}

			for (JSONObject item : _liferayClient.getAll("/o/c/bookingitems?filter=r_bookingItems_c_bookingId eq '" + booking.getLong("id") + "'")) {
				categories.add(_key(item.opt("category")));
			}
		}

		categories.remove("flight");

		List<Recommendation> recommendations = new ArrayList<>();

		for (JSONObject host : context.hosts()) {
			if (!_approved(host) || !"active".equals(_key(host.opt("hostStatus")))) {
				continue;
			}

			List<String> matches = new ArrayList<>();

			for (JSONObject specialty : _objects(host.optJSONArray("specialties"))) {
				if (categories.contains(specialty.optString("key"))) {
					matches.add(specialty.optString("name").toLowerCase(Locale.ENGLISH));
				}
			}

			if (!matches.isEmpty()) {
				recommendations.add(
					new Recommendation(
						"hostsForYou", "r_hostRecommendations_c_hostId", host.getLong("id"), 50 + (10 * matches.size()),
						host.optString("displayName") + " specialises in " + String.join(", ", matches) + ", like your past trips",
						List.of("pastTravel")));
			}
		}

		return _top(recommendations);
	}

	private static Set<String> _keys(JSONArray jsonArray) {
		Set<String> keys = new LinkedHashSet<>();

		for (JSONObject jsonObject : _objects(jsonArray)) {
			keys.add(jsonObject.optString("key"));
		}

		return keys;
	}

	private static String _key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return (picklistValue == null) ? "" : picklistValue.toString();
	}

	private List<Recommendation> _longWeekend(Context context) {
		JSONObject holiday = context.longWeekend();

		if (holiday == null) {
			return List.of();
		}

		LocalDate start = LocalDate.parse(holiday.getString("longWeekendStart").substring(0, 10));
		LocalDate end = LocalDate.parse(holiday.getString("longWeekendEnd").substring(0, 10));
		String month = start.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH).toLowerCase(Locale.ENGLISH);
		List<Recommendation> recommendations = new ArrayList<>();

		for (JSONObject destination : context.destinations()) {
			if (_bestIn(destination, month)) {
				recommendations.add(
					new Recommendation(
						"longWeekend", "r_destinationRecommendations_c_destinationId", destination.getLong("id"),
						60 + (destination.optBoolean("isTrending") ? 10 : 0),
						"Long weekend " + _DAY.format(start) + "–" + _DAY.format(end) + " (" + holiday.optString("name") + "): " +
							destination.optString("name") + " is at its best",
						List.of("publicHolidays")));
			}
		}

		return _top(recommendations);
	}

	private List<Recommendation> _nearYou(Context context, JSONObject traveler) {
		Object latitude = traveler.opt("latitude");
		Object longitude = traveler.opt("longitude");

		if ((latitude == null) || (longitude == null) || "".equals(latitude.toString()) || "".equals(longitude.toString())) {
			return List.of();
		}

		String weekEnd = context.today().plusDays(7).toString();
		Set<Long> availableSoon = new LinkedHashSet<>();

		for (JSONObject listing : context.listings()) {
			String next = listing.optString("nextAvailableDate");

			if (_approved(listing) && (next.length() >= 10) && (next.substring(0, 10).compareTo(weekEnd) <= 0)) {
				availableSoon.add(listing.optLong("r_destinationListings_c_destinationId"));
			}
		}

		List<Recommendation> recommendations = new ArrayList<>();

		for (JSONObject destination : context.destinations()) {
			if (!availableSoon.contains(destination.getLong("id")) || "".equals(destination.optString("latitude"))) {
				continue;
			}

			double km = _distanceKm(
				Double.parseDouble(latitude.toString()), Double.parseDouble(longitude.toString()), destination.getDouble("latitude"),
				destination.getDouble("longitude"));

			if (km <= 300) {
				recommendations.add(
					new Recommendation(
						"nearYou", "r_destinationRecommendations_c_destinationId", destination.getLong("id"), Math.max(1, 100 - (km / 5)),
						destination.optString("name") + " is " + Math.round(km) + " km away, with trips available this week",
						List.of("currentLocation")));
			}
		}

		return _top(recommendations);
	}

	/**
	 * The first long weekend starting within the next 60 days.
	 */
	private JSONObject _nextLongWeekend(LocalDate today) {
		String from = today.toString();
		String to = today.plusDays(60).toString();

		return _liferayClient.getAll(
			"/o/c/publicholidays"
		).stream(
		).filter(
			holiday -> holiday.optString("longWeekendStart").length() >= 10
		).filter(
			holiday -> {
				String start = holiday.getString("longWeekendStart").substring(0, 10);

				return (start.compareTo(from) >= 0) && (start.compareTo(to) <= 0);
			}
		).min(
			Comparator.comparing(holiday -> holiday.getString("longWeekendStart"))
		).orElse(
			null
		);
	}

	private static List<JSONObject> _objects(JSONArray jsonArray) {
		List<JSONObject> objects = new ArrayList<>();

		for (int i = 0; (jsonArray != null) && (i < jsonArray.length()); i++) {
			if (jsonArray.opt(i) instanceof JSONObject jsonObject) {
				objects.add(jsonObject);
			}
		}

		return objects;
	}

	private List<Recommendation> _placesNow(Context context, boolean useWeather) {
		String month = context.today().getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
		List<Recommendation> recommendations = new ArrayList<>();

		for (JSONObject destination : context.destinations()) {
			if (!_bestIn(destination, month.toLowerCase(Locale.ENGLISH))) {
				continue;
			}

			boolean trending = destination.optBoolean("isTrending");
			boolean goodWeather = useWeather && (context.goodWeatherDays().getOrDefault(destination.getLong("id"), 0) >= 4);
			List<String> factors = new ArrayList<>(List.of("monthSeason"));

			if (goodWeather) {
				factors.add("weather");
			}

			recommendations.add(
				new Recommendation(
					"placesNow", "r_destinationRecommendations_c_destinationId", destination.getLong("id"),
					50 + (trending ? 20 : 0) + (goodWeather ? 20 : 0),
					destination.optString("name") + " is at its best in " + month + (trending ? ", and trending" : "") +
						(goodWeather ? "; good weather most of this week" : ""),
					factors));
		}

		return _top(recommendations);
	}

	private static List<Recommendation> _top(List<Recommendation> recommendations) {
		return recommendations.stream(
		).sorted(
			Comparator.comparingDouble(Recommendation::score).reversed()
		).limit(
			3
		).toList();
	}

	private static final DateTimeFormatter _DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);

	private static final ZoneId _IST = ZoneId.of("Asia/Kolkata");

	private final LiferayClient _liferayClient;

	private record Context(
		LocalDate today, List<JSONObject> destinations, Map<Long, Integer> goodWeatherDays, List<JSONObject> hosts,
		List<JSONObject> listings, JSONObject longWeekend) {
	}

	private record Recommendation(
		String section, String relationshipField, long targetId, double score, String reason, List<String> factors) {
	}

}
