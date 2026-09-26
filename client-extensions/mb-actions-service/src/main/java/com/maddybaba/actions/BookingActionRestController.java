package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.util.Set;

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
 * Booking actions:
 * - add: the traveler who created it keeps View only (docs/data-model.md 6.3).
 * - add or update: recompute serviceFee, taxes and total from the subtotal, overwriting client values.
 * - bookingStatus becomes confirmed: create the host and referral commissions and notify.
 * - bookingStatus becomes cancelled or refunded: reverse unpaid commissions and request the refund.
 */
@RequestMapping("/object/action/booking")
@RestController
public class BookingActionRestController extends BaseRestController {

	public BookingActionRestController(Commissions commissions, Recalculator recalculator) {
		_commissions = commissions;
		_recalculator = recalculator;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);
		long bookingId = payload.entryId();

		if ("onAfterAdd".equals(payload.trigger())) {
			_recalculator.ownerViewOnly("bookings", bookingId);
		}

		_recalculator.bookingPricing(bookingId);

		String status = payload.key("bookingStatus");

		if (status.equals(payload.originalKey("bookingStatus"))) {
			return ResponseEntity.ok("{}");
		}

		if ("confirmed".equals(status)) {
			_commissions.createForBooking(bookingId);

			// Notifications are logged until email/SMS is set up.

			_log.info("NOTIFY traveler and host: booking {} confirmed", bookingId);
		}
		else if (_REVERSING.contains(status)) {
			_commissions.reverseForBooking(bookingId);

			// The payment gateway refund is phase 7c; logged until then.

			_log.info("REFUND requested for booking {} ({})", bookingId, status);
		}

		return ResponseEntity.ok("{}");
	}

	private static final Set<String> _REVERSING = Set.of("cancelled", "refunded");

	private static final Logger _log = LoggerFactory.getLogger(BookingActionRestController.class);

	private final Commissions _commissions;
	private final Recalculator _recalculator;

}
