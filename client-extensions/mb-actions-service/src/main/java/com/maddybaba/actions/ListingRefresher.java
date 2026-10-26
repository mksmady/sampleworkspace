package com.maddybaba.actions;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;

import org.json.JSONObject;

import org.springframework.stereotype.Component;

/**
 * A Listing's derived fields (docs/search.md section 3): copies of its Destination (destinationName,
 * stateName, region, latitude, longitude) and Host (hostDisplayName), the earliest open slot from today
 * (nextAvailableDate) and ratingValue and reviewCount from its published reviews (Ratings). Only
 * differing fields are written; if the listing was approved, the service approves its own update
 * (WorkflowApprover).
 */
@Component
public class ListingRefresher {

	public ListingRefresher(LiferayClient liferayClient, WorkflowApprover workflowApprover) {
		_liferayClient = liferayClient;
		_workflowApprover = workflowApprover;
	}

	public void refresh(long listingId) {
		if (listingId <= 0) {
			return;
		}

		JSONObject listing = _liferayClient.getOrNull("/o/c/listings/" + listingId);

		if (listing == null) {
			return;
		}

		JSONObject wanted = new JSONObject();
		long destinationId = listing.optLong("r_destinationListings_c_destinationId", 0);

		if (destinationId > 0) {
			JSONObject destination = _liferayClient.get("/o/c/destinations/" + destinationId);
			JSONObject state = destination.optJSONObject("state");

			wanted.put("destinationName", destination.optString("name"));
			wanted.put("latitude", destination.opt("latitude"));
			wanted.put("longitude", destination.opt("longitude"));
			wanted.put("region", destination.optString("region"));
			wanted.put("stateName", (state == null) ? "" : state.optString("name"));
		}

		long hostId = listing.optLong("r_hostListings_c_hostId", 0);

		if (hostId > 0) {
			wanted.put("hostDisplayName", _liferayClient.get("/o/c/hosts/" + hostId).optString("displayName"));
		}

		wanted.put("nextAvailableDate", _nextAvailableDate(listingId));

		Ratings ratings = Ratings.of(_liferayClient.getAll("/o/c/reviews?filter=r_listingReviews_c_listingId eq '" + listingId + "'"));

		wanted.put("ratingValue", ratings.ratingValue());
		wanted.put("reviewCount", ratings.reviewCount());

		JSONObject patch = Values.diff(wanted, listing);

		if (patch.isEmpty()) {
			return;
		}

		_liferayClient.patch("/o/c/listings/" + listingId, patch);

		if (Values.isApproved(listing)) {
			_workflowApprover.approveAutomaticUpdate(listingId);
		}
	}

	/**
	 * Refreshes every listing whose relationship field points at the given entry.
	 */
	public void refreshAll(String relationshipField, long id) {
		for (JSONObject listing : _liferayClient.getAll("/o/c/listings?filter=" + relationshipField + " eq '" + id + "'")) {
			refresh(listing.getLong("id"));
		}
	}

	private Object _nextAvailableDate(long listingId) {
		String today = LocalDate.now(ZoneId.of("Asia/Kolkata")).toString();

		List<JSONObject> slots = _liferayClient.getAll("/o/c/availabilityslots?filter=r_listingSlots_c_listingId eq '" + listingId + "'");

		return slots.stream(
		).filter(
			slot -> "open".equals(Values.key(slot.opt("slotStatus")))
		).map(
			slot -> slot.optString("slotDate").substring(0, 10)
		).filter(
			date -> date.compareTo(today) >= 0
		).min(
			Comparator.naturalOrder()
		).map(
			date -> (Object)date
		).orElse(
			JSONObject.NULL
		);
	}

	private final LiferayClient _liferayClient;
	private final WorkflowApprover _workflowApprover;

}
