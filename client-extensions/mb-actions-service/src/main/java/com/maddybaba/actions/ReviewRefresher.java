package com.maddybaba.actions;

import org.json.JSONObject;

import org.springframework.stereotype.Component;

/**
 * A Review's copied fields (docs/data-model.md 3.16): hostDisplayName and destinationName from its Host,
 * so the home page testimonials need no Host access; and, while empty, reviewerName and reviewerCity
 * from its Traveler (people may edit those, so they're never overwritten). Only differing fields are
 * written.
 */
@Component
public class ReviewRefresher {

	public ReviewRefresher(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	public void refresh(long reviewId) {
		JSONObject review = _liferayClient.getOrNull("/o/c/reviews/" + reviewId);

		if (review == null) {
			return;
		}

		JSONObject wanted = new JSONObject();
		long hostId = review.optLong("r_hostReviews_c_hostId", 0);
		JSONObject host = (hostId > 0) ? _liferayClient.getOrNull("/o/c/hosts/" + hostId) : null;

		wanted.put("hostDisplayName", (host == null) ? "" : host.optString("displayName"));

		long destinationId = (host == null) ? 0 : host.optLong("r_destinationHosts_c_destinationId", 0);
		JSONObject destination = (destinationId > 0) ? _liferayClient.getOrNull("/o/c/destinations/" + destinationId) : null;

		wanted.put("destinationName", (destination == null) ? "" : destination.optString("name"));

		long travelerId = review.optLong("r_travelerReviews_c_travelerId", 0);

		if ((travelerId > 0) && (_isEmpty(review, "reviewerName") || _isEmpty(review, "reviewerCity"))) {
			JSONObject traveler = _liferayClient.getOrNull("/o/c/travelers/" + travelerId);

			if (traveler != null) {
				if (_isEmpty(review, "reviewerName")) {
					wanted.put("reviewerName", traveler.optString("fullName"));
				}

				if (_isEmpty(review, "reviewerCity")) {
					wanted.put("reviewerCity", traveler.optString("homeCity"));
				}
			}
		}

		JSONObject patch = Values.diff(wanted, review);

		if (!patch.isEmpty()) {
			_liferayClient.patch("/o/c/reviews/" + reviewId, patch);
		}
	}

	/**
	 * Refreshes every review of the given host (its name or destination changed).
	 */
	public void refreshForHost(long hostId) {
		if (hostId <= 0) {
			return;
		}

		for (JSONObject review : _liferayClient.getAll("/o/c/reviews?filter=r_hostReviews_c_hostId eq '" + hostId + "'")) {
			refresh(review.getLong("id"));
		}
	}

	private static boolean _isEmpty(JSONObject review, String name) {
		return review.optString(name, "").isBlank();
	}

	private final LiferayClient _liferayClient;

}
