package com.maddybaba.actions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

import org.json.JSONObject;

import org.springframework.stereotype.Component;

/**
 * A Listing's derived fields (docs/search.md section 3): copies of its Destination (destinationName,
 * stateName, region, latitude, longitude) and Host (hostDisplayName), the earliest open slot from today
 * (nextAvailableDate) and a stored copy of averageRating (ratingValue). Only differing fields are
 * written; if the listing was approved, the service approves its own update (WorkflowApprover).
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
		wanted.put("ratingValue", listing.opt("averageRating"));

		JSONObject patch = new JSONObject();

		for (String name : wanted.keySet()) {
			if (!_same(wanted.opt(name), listing.opt(name))) {
				patch.put(name, wanted.get(name));
			}
		}

		if (patch.isEmpty()) {
			return;
		}

		boolean wasApproved = listing.optJSONObject("status").optInt("code", -1) == 0;

		_liferayClient.patch("/o/c/listings/" + listingId, patch);

		if (wasApproved) {
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
			slot -> "open".equals(_key(slot.opt("slotStatus")))
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

	private static String _key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return (picklistValue == null) ? "" : picklistValue.toString();
	}

	/**
	 * Compares a wanted value with the stored one: numbers by value, dates by day, empty and null alike.
	 */
	private static boolean _same(Object wanted, Object stored) {
		boolean wantedEmpty = (wanted == null) || (wanted == JSONObject.NULL) || "".equals(wanted);
		boolean storedEmpty = (stored == null) || (stored == JSONObject.NULL) || "".equals(stored);

		if (wantedEmpty || storedEmpty) {
			return wantedEmpty && storedEmpty;
		}

		if ((wanted instanceof Number) || (stored instanceof Number)) {
			try {
				return new BigDecimal(wanted.toString()).compareTo(new BigDecimal(stored.toString())) == 0;
			}
			catch (NumberFormatException numberFormatException) {
				return false;
			}
		}

		String a = wanted.toString();
		String b = stored.toString();

		if (a.matches("\\d{4}-\\d{2}-\\d{2}")) {
			return b.startsWith(a);
		}

		return Objects.equals(a, b);
	}

	private final LiferayClient _liferayClient;
	private final WorkflowApprover _workflowApprover;

}
