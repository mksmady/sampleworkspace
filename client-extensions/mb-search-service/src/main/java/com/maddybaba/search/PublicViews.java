package com.maddybaba.search;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the public may see of each object: every response is built from these whitelists, never from
 * the raw entries (the service reads as an administrator; hosts' phone, payout and commission details
 * and all account links stay private). docs/data-model.md 6.2, docs/search.md sections 2 and 8.
 */
public final class PublicViews {

	public static JSONObject destination(JSONObject destination) {
		JSONObject state = destination.optJSONObject("state");

		return new JSONObject(
		).put(
			"bestMonths", _keys(destination.optJSONArray("bestMonths"))
		).put(
			"description", destination.optString("description")
		).put(
			"externalReferenceCode", destination.optString("externalReferenceCode")
		).put(
			"heroImageUrl", _imageURL(destination.opt("heroImage"))
		).put(
			"hostCount", destination.optInt("hostCount")
		).put(
			"id", destination.getLong("id")
		).put(
			"isTrending", destination.optBoolean("isTrending")
		).put(
			"name", destination.optString("name")
		).put(
			"region", destination.optString("region")
		).put(
			"slug", destination.optString("slug")
		).put(
			"stateName", (state == null) ? "" : state.optString("name")
		);
	}

	/**
	 * A host card (docs/search.md 8, GET /search/hosts). The price is "completeTripsFrom" when the host
	 * has an approved complete trip, else "priceFrom"; null without approved listings (both stored
	 * prices are 0). Only hosts in the public catalog are approved and active, so verified is true.
	 */
	public static JSONObject host(JSONObject host) {
		JSONObject hostRole = host.optJSONObject("hostRole");
		double completeTripsFrom = _number(host.opt("completeTripsFrom"));
		double priceFrom = _number(host.opt("priceFrom"));
		double rating = _number(host.opt("ratingValue"));

		JSONObject price = null;

		if (completeTripsFrom > 0) {
			price = _price("completeTripsFrom", host.opt("completeTripsFrom"));
		}
		else if (priceFrom > 0) {
			price = _price("priceFrom", host.opt("priceFrom"));
		}

		return new JSONObject(
		).put(
			"avatarUrl", _imageURL(host.opt("avatar"))
		).put(
			"bio", host.optString("bio")
		).put(
			"canArrangeEntireTrip", _keys(host.optJSONArray("hostOffers")).toList().contains("fullTrip")
		).put(
			"destinationName", host.optString("destinationName")
		).put(
			"displayName", host.optString("displayName")
		).put(
			"handle", host.optString("handle")
		).put(
			"hostRole", (hostRole == null) ? JSONObject.NULL : new JSONObject().put("key", hostRole.optString("key")).put("label", hostRole.optString("name"))
		).put(
			"id", host.getLong("id")
		).put(
			"price", (price == null) ? JSONObject.NULL : price
		).put(
			"quote", host.optString("quote")
		).put(
			"rating", (rating > 0) ? host.opt("ratingValue") : JSONObject.NULL
		).put(
			"reviewCount", host.optInt("reviewCount")
		).put(
			"specialties", _labelled(host.optJSONArray("specialties"))
		).put(
			"stateName", host.optString("stateName")
		).put(
			"type", "host"
		).put(
			"verified", true
		);
	}

	public static JSONObject listing(JSONObject listing) {
		JSONObject category = listing.optJSONObject("category");
		JSONObject priceUnit = listing.optJSONObject("priceUnit");
		double rating = _number(listing.opt("ratingValue"));

		return new JSONObject(
		).put(
			"category", (category == null) ? "" : category.optString("key")
		).put(
			"categoryLabel", (category == null) ? "" : category.optString("name")
		).put(
			"destinationName", listing.optString("destinationName")
		).put(
			"durationText", listing.optString("durationText")
		).put(
			"externalReferenceCode", listing.optString("externalReferenceCode")
		).put(
			"heroImageUrl", _imageURL(listing.opt("heroImage"))
		).put(
			"hostDisplayName", listing.optString("hostDisplayName")
		).put(
			"id", listing.getLong("id")
		).put(
			"isFeatured", listing.optBoolean("isFeatured")
		).put(
			"isTrending", listing.optBoolean("isTrending")
		).put(
			"latitude", listing.opt("latitude")
		).put(
			"longitude", listing.opt("longitude")
		).put(
			"maxGuests", listing.opt("maxGuests")
		).put(
			"nextAvailableDate", _date(listing.optString("nextAvailableDate"))
		).put(
			"price",
			new JSONObject(
			).put(
				"amount", listing.opt("basePrice")
			).put(
				"currency", "INR"
			).put(
				"unit", (priceUnit == null) ? "" : priceUnit.optString("key")
			)
		).put(
			"rating", (rating > 0) ? listing.opt("ratingValue") : JSONObject.NULL
		).put(
			"reviewCount", listing.optInt("reviewCount")
		).put(
			"shortDescription", listing.optString("shortDescription")
		).put(
			"slug", listing.optString("slug")
		).put(
			"stateName", listing.optString("stateName")
		).put(
			"title", listing.optString("title")
		).put(
			"type", "listing"
		);
	}

	/**
	 * A published review on a host profile: no traveler or booking links.
	 */
	public static JSONObject review(JSONObject review) {
		return new JSONObject(
		).put(
			"comment", review.optString("comment")
		).put(
			"date", _date(review.optString("dateCreated"))
		).put(
			"destinationName", review.optString("destinationName")
		).put(
			"rating", review.optInt("rating")
		).put(
			"reviewerCity", review.optString("reviewerCity")
		).put(
			"reviewerName", review.optString("reviewerName")
		);
	}

	private static String _date(String value) {
		return (value.length() >= 10) ? value.substring(0, 10) : value;
	}

	private static Object _imageURL(Object attachment) {
		if (attachment instanceof JSONObject jsonObject) {
			JSONObject link = jsonObject.optJSONObject("link");

			if (link != null) {
				return link.optString("href");
			}
		}

		return JSONObject.NULL;
	}

	private static JSONArray _keys(JSONArray picklistValues) {
		JSONArray keys = new JSONArray();

		for (int i = 0; (picklistValues != null) && (i < picklistValues.length()); i++) {
			keys.put(Catalog.key(picklistValues.opt(i)));
		}

		return keys;
	}

	private static JSONArray _labelled(JSONArray picklistValues) {
		JSONArray labelled = new JSONArray();

		for (int i = 0; (picklistValues != null) && (i < picklistValues.length()); i++) {
			Object value = picklistValues.opt(i);
			String key = Catalog.key(value);
			String label = (value instanceof JSONObject jsonObject) ? jsonObject.optString("name", key) : key;

			labelled.put(new JSONObject().put("key", key).put("label", label));
		}

		return labelled;
	}

	private static double _number(Object value) {
		try {
			return ((value == null) || (value == JSONObject.NULL) || "".equals(value.toString())) ? 0 : Double.parseDouble(value.toString());
		}
		catch (NumberFormatException numberFormatException) {
			return 0;
		}
	}

	private static JSONObject _price(String label, Object amount) {
		return new JSONObject().put("amount", amount).put("currency", "INR").put("label", label);
	}

	private PublicViews() {
	}

}
