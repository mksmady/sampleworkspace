package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;

import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Validation rules Liferay's expression engine can't express (docs/data-model.md section 5). Each
 * answers with the request plus "validationCriteriaMet"; when false, Liferay rejects the save with the
 * rule's error message.
 */
@RequestMapping("/object/validation")
@RestController
public class ValidationRestController extends BaseRestController {

	public ValidationRestController(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	/**
	 * ListingInclusion: an add-on needs a price above zero.
	 */
	@PostMapping("/add-on-price")
	public ResponseEntity<String> addOnPrice(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		JSONObject values = _values("add-on-price", json);

		boolean addOn = "addOn".equals(_key(values.opt("inclusionType")));

		return _answer(json, !addOn || (Money.of(values.opt("addOnPrice")).signum() > 0));
	}

	/**
	 * Payout: a new request (payoutStatus requested) can't exceed the host's available balance. Later
	 * status changes aren't checked: by then the commissions are being paid out.
	 */
	@PostMapping("/payout-balance")
	public ResponseEntity<String> payoutBalance(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		JSONObject values = _values("payout-balance", json);

		if (!"requested".equals(_key(values.opt("payoutStatus")))) {
			return _answer(json, true);
		}

		long hostId = values.optLong("r_hostPayouts_c_hostId", 0);

		if (hostId <= 0) {
			return _answer(json, false);
		}

		BigDecimal availableBalance = Money.of(_liferayClient.get("/o/c/hosts/" + hostId).opt("availableBalance"));

		return _answer(json, Money.of(values.opt("amount")).compareTo(availableBalance) <= 0);
	}

	/**
	 * BookingItem: the quantity can't exceed the places left on its slot. Checked per item rather than
	 * per Booking, because a booking has no items (and so no slots) yet when it's created.
	 */
	@PostMapping("/slot-capacity")
	public ResponseEntity<String> slotCapacity(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		JSONObject values = _values("slot-capacity", json);
		long slotId = values.optLong("r_slotBookingItems_c_availabilitySlotId", 0);

		if (slotId <= 0) {
			return _answer(json, true);
		}

		JSONObject slot = _liferayClient.get("/o/c/availabilityslots/" + slotId);
		long left = slot.optLong("capacity") - Money.of(slot.opt("bookedCount")).longValue();

		// When an existing item is edited, its own stored quantity is already in bookedCount. The payload
		// has no entry ID, so the stored item is found by its external reference code.

		String erc = values.optString("externalReferenceCode");
		JSONObject stored = erc.isEmpty() ? null : _liferayClient.getOrNull("/o/c/bookingitems/by-external-reference-code/" + erc);

		if ((stored != null) && (stored.optLong("r_slotBookingItems_c_availabilitySlotId", 0) == slotId)) {
			left += stored.optLong("quantity");
		}

		return _answer(json, values.optLong("quantity") <= left);
	}

	private static ResponseEntity<String> _answer(String json, boolean valid) {
		return ResponseEntity.ok(new JSONObject(json).put("validationCriteriaMet", valid).toString());
	}

	private static String _key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return (picklistValue == null) ? "" : picklistValue.toString();
	}

	/**
	 * The entry's values: nested under objectEntry.values when present, otherwise at the top level (as
	 * in Liferay's sample). The first payload of each rule is logged to confirm the shape.
	 */
	private static JSONObject _values(String rule, String json) {
		if (_logged.add(rule)) {
			_log.info("First {} payload: {}", rule, json);
		}

		JSONObject jsonObject = new JSONObject(json);
		JSONObject objectEntry = jsonObject.optJSONObject("objectEntry");

		if ((objectEntry != null) && (objectEntry.optJSONObject("values") != null)) {
			return objectEntry.getJSONObject("values");
		}

		return jsonObject;
	}

	private static final Logger _log = LoggerFactory.getLogger(ValidationRestController.class);

	private static final Set<String> _logged = ConcurrentHashMap.newKeySet();

	private final LiferayClient _liferayClient;

}
