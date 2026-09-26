package com.maddybaba.actions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Commissions from bookings (docs/data-model.md section 7). Each booking gets at most one commission per
 * role, with a fixed ERC (MB_commission_<booking id>_host / _referral), so running again never
 * duplicates one and never overwrites one that has moved on (available, paid out).
 */
@Component
public class Commissions {

	public Commissions(
		LiferayClient liferayClient, @Value("${mb.commission.referral-percent}") BigDecimal referralPercent,
		@Value("${mb.commission.available-after-days}") int availableAfterDays) {

		_liferayClient = liferayClient;
		_referralPercent = referralPercent;
		_availableAfterDays = availableAfterDays;
	}

	/**
	 * Booking confirmed: the booking's host earns Host.commissionRate % of their own items (flights have
	 * no host), the referral host earns the referral % of the subtotal. Both start pending and become
	 * available a set number of days after the trip ends.
	 */
	public void createForBooking(long bookingId) {
		JSONObject booking = _liferayClient.get("/o/c/bookings/" + bookingId);
		long hostId = booking.optLong("r_hostBookings_c_hostId", 0);
		long referralHostId = booking.optLong("r_referralBookings_c_hostId", 0);
		String availableOn = _tripEnd(booking).plusDays(_availableAfterDays).toString();

		if (hostId > 0) {
			JSONObject host = _liferayClient.get("/o/c/hosts/" + hostId);

			_create(
				bookingId, "host", host, _hostItemsTotal(bookingId, hostId), Money.of(host.opt("commissionRate")), availableOn);
		}

		if ((referralHostId > 0) && (referralHostId != hostId)) {
			_create(
				bookingId, "referral", _liferayClient.get("/o/c/hosts/" + referralHostId), Money.of(booking.opt("subtotal")),
				_referralPercent, availableOn);
		}
	}

	/**
	 * Booking cancelled or refunded: commissions not yet paid out are reversed. Paid-out ones are left
	 * and logged; recovering them is a manual step for Ops.
	 */
	public void reverseForBooking(long bookingId) {
		for (JSONObject commission : _liferayClient.getAll("/o/c/commissions?filter=r_bookingCommissions_c_bookingId eq '" + bookingId + "'")) {
			String status = _key(commission.opt("commissionStatus"));

			if ("pending".equals(status) || "available".equals(status)) {
				_liferayClient.patch("/o/c/commissions/" + commission.getLong("id"), new JSONObject().put("commissionStatus", "reversed"));
			}
			else if ("paidOut".equals(status)) {
				_log.warn("Commission {} of cancelled booking {} was already paid out; Ops must recover it", commission.getLong("id"), bookingId);
			}
		}
	}

	private void _create(long bookingId, String role, JSONObject host, BigDecimal baseAmount, BigDecimal rate, String availableOn) {
		if ((baseAmount.signum() <= 0) || (rate.signum() <= 0)) {
			_log.info("No {} commission for booking {}: base {} rate {}", role, bookingId, baseAmount, rate);

			return;
		}

		String erc = "MB_commission_" + bookingId + "_" + role;

		if (_liferayClient.getOrNull("/o/c/commissions/by-external-reference-code/" + erc) != null) {
			return;
		}

		JSONObject commission = new JSONObject(
		).put(
			"availableOn", availableOn
		).put(
			"baseAmount", baseAmount
		).put(
			"commissionStatus", "pending"
		).put(
			"externalReferenceCode", erc
		).put(
			"r_bookingCommissions_c_bookingId", bookingId
		).put(
			"r_hostCommissions_c_hostId", host.getLong("id")
		).put(
			"rate", rate
		);

		long accountId = host.optLong("r_accountHosts_accountEntryId", 0);

		if (accountId > 0) {
			commission.put("r_accountCommissions_accountEntryId", accountId);
		}

		_liferayClient.post("/o/c/commissions", commission);
	}

	private BigDecimal _hostItemsTotal(long bookingId, long hostId) {
		Map<Long, Long> listingHosts = new HashMap<>();
		BigDecimal total = BigDecimal.ZERO.setScale(2);

		List<JSONObject> items = _liferayClient.getAll("/o/c/bookingitems?filter=r_bookingItems_c_bookingId eq '" + bookingId + "'");

		for (JSONObject item : items) {
			long listingId = item.optLong("r_listingBookingItems_c_listingId", 0);

			if (listingId <= 0) {
				continue;
			}

			long listingHost = listingHosts.computeIfAbsent(
				listingId, id -> _liferayClient.get("/o/c/listings/" + id).optLong("r_hostListings_c_hostId", 0));

			if (listingHost == hostId) {
				total = total.add(Money.of(item.opt("lineTotal")));
			}
		}

		return total;
	}

	private static String _key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return (picklistValue == null) ? "" : picklistValue.toString();
	}

	/**
	 * The trip's last day: the package end date when the booking has a package, otherwise the travel date.
	 */
	private LocalDate _tripEnd(JSONObject booking) {
		long packageId = booking.optLong("r_packageBookings_c_tripPackageId", 0);

		if (packageId > 0) {
			String endDate = _liferayClient.get("/o/c/trippackages/" + packageId).optString("endDate");

			if (!endDate.isEmpty()) {
				return LocalDate.parse(endDate.substring(0, 10));
			}
		}

		return LocalDate.parse(booking.getString("travelDate").substring(0, 10));
	}

	private static final Logger _log = LoggerFactory.getLogger(Commissions.class);

	private final int _availableAfterDays;
	private final LiferayClient _liferayClient;
	private final BigDecimal _referralPercent;

}
