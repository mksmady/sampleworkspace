package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

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
 * Payment add or update: a pendingPayment booking becomes confirmed (which creates its commissions) only
 * when the stored payment (ActionPayload trust rule) passes all of docs/data-model.md 7.1: paymentStatus
 * success, a gateway transaction ID, and an amount equal to the booking's stored total. Only the payment
 * integration and Ops write payments (6.2).
 */
@RequestMapping("/object/action/payment")
@RestController
public class PaymentActionRestController extends BaseRestController {

	public PaymentActionRestController(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.trusted(json, _liferayClient, "payments");

		if ((payload == null) || !"success".equals(payload.key("paymentStatus"))) {
			return ResponseEntity.ok("{}");
		}

		long paymentId = payload.entryId();
		long bookingId = payload.id("r_bookingPayments_c_bookingId");

		if (bookingId <= 0) {
			_log.warn("Payment {} succeeded without a booking; nothing confirmed", paymentId);

			return ResponseEntity.ok("{}");
		}

		if (payload.values().optString("gatewayTxnId", "").isBlank()) {
			_log.warn("Payment {} has no gateway transaction ID; booking {} not confirmed", paymentId, bookingId);

			return ResponseEntity.ok("{}");
		}

		JSONObject booking = _liferayClient.get("/o/c/bookings/" + bookingId);

		if (!Money.same(payload.decimal("amount"), booking.opt("total"))) {
			_log.warn(
				"Payment {} amount {} doesn't match booking {} total {}; not confirmed", paymentId, payload.decimal("amount"), bookingId,
				booking.opt("total"));

			return ResponseEntity.ok("{}");
		}

		String bookingStatus = Values.key(booking.opt("bookingStatus"));

		if ("pendingPayment".equals(bookingStatus)) {
			_liferayClient.patch("/o/c/bookings/" + bookingId, new JSONObject().put("bookingStatus", "confirmed"));
		}
		else {
			_log.info("Payment {} succeeded for booking {} in status {}; not changed", paymentId, bookingId, bookingStatus);
		}

		return ResponseEntity.ok("{}");
	}

	private static final Logger _log = LoggerFactory.getLogger(PaymentActionRestController.class);

	private final LiferayClient _liferayClient;

}
