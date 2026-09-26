package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Booking add: the traveler who created it keeps View only (docs/data-model.md 6.3).
 * Booking add or update: recompute serviceFee, taxes and total from the subtotal, overwriting any
 * value a client sent.
 */
@RequestMapping("/object/action/booking")
@RestController
public class BookingActionRestController extends BaseRestController {

	public BookingActionRestController(Recalculator recalculator) {
		_recalculator = recalculator;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);

		if ("onAfterAdd".equals(payload.trigger())) {
			_recalculator.ownerViewOnly("bookings", payload.entryId());
		}

		_recalculator.bookingPricing(payload.entryId());

		return ResponseEntity.ok("{}");
	}

	private final Recalculator _recalculator;

}
