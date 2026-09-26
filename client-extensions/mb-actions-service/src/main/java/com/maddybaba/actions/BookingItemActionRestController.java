package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;

import org.json.JSONObject;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * BookingItem add, update or delete: store lineTotal = quantity x unitPrice (overwriting any client
 * value), then refresh the pricing of the bookings and the status of the slots the item is, or was,
 * linked to (their aggregations just changed).
 */
@RequestMapping("/object/action/booking-item")
@RestController
public class BookingItemActionRestController extends BaseRestController {

	public BookingItemActionRestController(LiferayClient liferayClient, Recalculator recalculator) {
		_liferayClient = liferayClient;
		_recalculator = recalculator;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);

		if (!"onAfterDelete".equals(payload.trigger())) {
			BigDecimal lineTotal = payload.decimal("unitPrice").multiply(BigDecimal.valueOf(payload.values().optLong("quantity")));

			if (!Money.same(lineTotal, payload.values().opt("lineTotal"))) {
				_liferayClient.patch("/o/c/bookingitems/" + payload.entryId(), new JSONObject().put("lineTotal", lineTotal));
			}
		}

		// Current and previous links are usually the same entry; refresh each one once.

		for (long bookingId : new LinkedHashSet<>(List.of(payload.id(_BOOKING), payload.originalId(_BOOKING)))) {
			_recalculator.bookingPricing(bookingId);
		}

		for (long slotId : new LinkedHashSet<>(List.of(payload.id(_SLOT), payload.originalId(_SLOT)))) {
			_recalculator.slotStatus(slotId);
		}

		return ResponseEntity.ok("{}");
	}

	private static final String _BOOKING = "r_bookingItems_c_bookingId";

	private static final String _SLOT = "r_slotBookingItems_c_availabilitySlotId";

	private final LiferayClient _liferayClient;
	private final Recalculator _recalculator;

}
