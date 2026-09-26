package com.maddybaba.search;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the public may see of each object: every response is built from these whitelists, never from
 * the raw entries (the service reads as an administrator; hosts' phone, payout and commission details
 * and all account links stay private). docs/data-model.md 6.2, docs/search.md section 2.
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

	public static JSONObject host(JSONObject host) {
		JSONObject tier = host.optJSONObject("tier");

		return new JSONObject(
		).put(
			"avatarUrl", _imageURL(host.opt("avatar"))
		).put(
			"bio", host.optString("bio")
		).put(
			"displayName", host.optString("displayName")
		).put(
			"handle", host.optString("handle")
		).put(
			"hostRegion", host.optString("hostRegion")
		).put(
			"id", host.getLong("id")
		).put(
			"specialties", _keys(host.optJSONArray("specialties"))
		).put(
			"tier", (tier == null) ? "" : tier.optString("key")
		);
	}

	public static JSONObject listing(JSONObject listing) {
		JSONObject category = listing.optJSONObject("category");
		JSONObject priceUnit = listing.optJSONObject("priceUnit");
		Object rating = listing.opt("ratingValue");

		return new JSONObject(
		).put(
			"category", (category == null) ? "" : category.optString("key")
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
			"rating", ((rating == null) || (rating == JSONObject.NULL) || "".equals(rating)) ? JSONObject.NULL : rating
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

	private PublicViews() {
	}

}
