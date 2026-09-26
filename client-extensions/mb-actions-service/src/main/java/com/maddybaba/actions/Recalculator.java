package com.maddybaba.actions;

import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;

import org.json.JSONArray;
import org.json.JSONObject;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Derived values that more than one trigger needs to refresh. Every method reads the entry fresh and
 * writes only the fields that differ, so a write that triggers the same action again ends there
 * (docs/search.md section 3: idempotent, no self-triggering loops).
 */
@Component
public class Recalculator {

	public Recalculator(
		LiferayClient liferayClient, @Value("${mb.pricing.platform-fee-percent}") BigDecimal platformFeePercent,
		@Value("${mb.pricing.gst-on-fee-percent}") BigDecimal gstOnFeePercent) {

		_liferayClient = liferayClient;
		_platformFeePercent = platformFeePercent;
		_gstOnFeePercent = gstOnFeePercent;
	}

	/**
	 * serviceFee = platform fee % of subtotal, taxes = GST % of the fee, total = subtotal + fee + taxes
	 * (docs/data-model.md 9.1 rates, configured in application-default.properties).
	 */
	public void bookingPricing(long bookingId) {
		if (bookingId <= 0) {
			return;
		}

		JSONObject booking = _liferayClient.get("/o/c/bookings/" + bookingId);

		BigDecimal subtotal = Money.of(booking.opt("subtotal"));
		BigDecimal serviceFee = Money.percentOf(subtotal, _platformFeePercent);
		BigDecimal taxes = Money.percentOf(serviceFee, _gstOnFeePercent);
		BigDecimal total = subtotal.add(serviceFee).add(taxes);

		JSONObject patch = new JSONObject();

		_putIfChanged(patch, booking, "serviceFee", serviceFee);
		_putIfChanged(patch, booking, "taxes", taxes);
		_putIfChanged(patch, booking, "total", total);

		if (!patch.isEmpty()) {
			_liferayClient.patch("/o/c/bookings/" + bookingId, patch);
		}
	}

	/**
	 * A slot is full once bookedCount reaches capacity and open again below it. Closed slots are left
	 * alone: only people close them.
	 */
	public void slotStatus(long slotId) {
		if (slotId <= 0) {
			return;
		}

		JSONObject slot = _liferayClient.get("/o/c/availabilityslots/" + slotId);
		String current = _key(slot.opt("slotStatus"));

		if ("closed".equals(current)) {
			return;
		}

		long bookedCount = Money.of(slot.opt("bookedCount")).longValue();
		String wanted = (bookedCount >= slot.optLong("capacity")) ? "full" : "open";

		if (!wanted.equals(current)) {
			_liferayClient.patch("/o/c/availabilityslots/" + slotId, new JSONObject().put("slotStatus", wanted));
		}
	}

	/**
	 * Liferay gives the creator (Owner) Update and Delete on their own entry; bookings are changed only
	 * by services (docs/data-model.md 6.3), so the Owner keeps View.
	 */
	public void ownerViewOnly(String plural, long entryId) {
		String path = "/o/c/" + plural + "/" + entryId + "/permissions";
		JSONArray items = _liferayClient.get(path).getJSONArray("items");
		boolean changed = false;

		for (int i = 0; i < items.length(); i++) {
			JSONObject item = items.getJSONObject(i);

			if ("Owner".equals(item.optString("roleName")) &&
				!Objects.equals(item.getJSONArray("actionIds").toList(), List.of("VIEW"))) {

				item.put("actionIds", new JSONArray().put("VIEW"));
				changed = true;
			}
		}

		if (changed) {
			_liferayClient.put(path, items.toString());
		}
	}

	private static String _key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return (picklistValue == null) ? "" : picklistValue.toString();
	}

	private static void _putIfChanged(JSONObject patch, JSONObject entry, String name, BigDecimal value) {
		if (!Money.same(value, entry.opt(name))) {
			patch.put(name, value);
		}
	}

	private final BigDecimal _gstOnFeePercent;
	private final LiferayClient _liferayClient;
	private final BigDecimal _platformFeePercent;

}
