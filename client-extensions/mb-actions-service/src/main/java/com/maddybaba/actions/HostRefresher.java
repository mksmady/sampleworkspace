package com.maddybaba.actions;

import java.math.BigDecimal;
import java.util.List;

import org.json.JSONObject;

import org.springframework.stereotype.Component;

/**
 * A Host's derived fields (docs/data-model.md 3.3, docs/search.md section 3): destinationName and
 * stateName from its Destination, ratingValue and reviewCount from its published reviews, priceFrom and
 * completeTripsFrom from its approved listings (0 when there are none: Liferay stores an empty
 * PrecisionDecimal as 0, so 0 is "none"). Also each Destination's hostCount (active hosts). Only differing fields are written; if the host was approved, the service approves its own
 * update (WorkflowApprover).
 */
@Component
public class HostRefresher {

	public HostRefresher(LiferayClient liferayClient, WorkflowApprover workflowApprover) {
		_liferayClient = liferayClient;
		_workflowApprover = workflowApprover;
	}

	public void refresh(long hostId) {
		if (hostId <= 0) {
			return;
		}

		JSONObject host = _liferayClient.getOrNull("/o/c/hosts/" + hostId);

		if (host == null) {
			return;
		}

		JSONObject wanted = new JSONObject();
		long destinationId = host.optLong("r_destinationHosts_c_destinationId", 0);
		JSONObject destination = (destinationId > 0) ? _liferayClient.getOrNull("/o/c/destinations/" + destinationId) : null;

		wanted.put("destinationName", (destination == null) ? "" : destination.optString("name"));
		wanted.put("stateName", (destination == null) ? "" : _label(destination.opt("state")));

		Ratings ratings = Ratings.of(_liferayClient.getAll("/o/c/reviews?filter=r_hostReviews_c_hostId eq '" + hostId + "'"));

		wanted.put("ratingValue", ratings.ratingValue());
		wanted.put("reviewCount", ratings.reviewCount());

		List<JSONObject> listings = _liferayClient.getAll(
			"/o/c/listings?filter=r_hostListings_c_hostId eq '" + hostId + "'"
		).stream(
		).filter(
			Values::isApproved
		).toList();

		wanted.put("completeTripsFrom", _lowestPrice(listings, true));
		wanted.put("priceFrom", _lowestPrice(listings, false));

		JSONObject patch = Values.diff(wanted, host);

		if (!patch.isEmpty()) {
			_liferayClient.patch("/o/c/hosts/" + hostId, patch);

			if (Values.isApproved(host)) {
				_workflowApprover.approveAutomaticUpdate(hostId);
			}
		}

		refreshDestination(destinationId);
	}

	/**
	 * Refreshes every host whose relationship field points at the given entry.
	 */
	public void refreshAll(String relationshipField, long id) {
		for (JSONObject host : _liferayClient.getAll("/o/c/hosts?filter=" + relationshipField + " eq '" + id + "'")) {
			refresh(host.getLong("id"));
		}
	}

	/**
	 * hostCount = the destination's hosts with hostStatus active ("128 Hosts" on its tile). Only KYC
	 * approval sets active, so this counts approved hosts; it ignores the workflow status, which is
	 * pending for a moment whenever an approved host is updated (even by this service).
	 */
	public void refreshDestination(long destinationId) {
		if (destinationId <= 0) {
			return;
		}

		JSONObject destination = _liferayClient.getOrNull("/o/c/destinations/" + destinationId);

		if (destination == null) {
			return;
		}

		long hostCount = _liferayClient.getAll(
			"/o/c/hosts?filter=r_destinationHosts_c_destinationId eq '" + destinationId + "'"
		).stream(
		).filter(
			host -> "active".equals(Values.key(host.opt("hostStatus")))
		).count();

		JSONObject patch = Values.diff(new JSONObject().put("hostCount", hostCount), destination);

		if (!patch.isEmpty()) {
			_liferayClient.patch("/o/c/destinations/" + destinationId, patch);
		}
	}

	private static String _label(Object picklistValue) {
		return (picklistValue instanceof JSONObject jsonObject) ? jsonObject.optString("name") : "";
	}

	private static BigDecimal _lowestPrice(List<JSONObject> listings, boolean completeTrips) {
		return listings.stream(
		).filter(
			listing -> "completeTrip".equals(Values.key(listing.opt("category"))) == completeTrips
		).map(
			listing -> Money.of(listing.opt("basePrice"))
		).filter(
			price -> price.signum() > 0
		).min(
			BigDecimal::compareTo
		).orElse(
			BigDecimal.ZERO
		);
	}

	private final LiferayClient _liferayClient;
	private final WorkflowApprover _workflowApprover;

}
