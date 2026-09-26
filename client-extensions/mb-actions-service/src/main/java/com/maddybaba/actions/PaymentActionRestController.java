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
 * Payment add or update: when paymentStatus becomes success, confirm the booking (pendingPayment ->
 * confirmed), which in turn creates its commissions. Only the payment integration writes payments
 * (docs/data-model.md 6.2).
 */
@RequestMapping("/object/action/payment")
@RestController
public class PaymentActionRestController extends BaseRestController {

	public PaymentActionRestController(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);
		long bookingId = payload.id("r_bookingPayments_c_bookingId");

		if (!"success".equals(payload.key("paymentStatus")) || "success".equals(payload.originalKey("paymentStatus")) || (bookingId <= 0)) {
			return ResponseEntity.ok("{}");
		}

		JSONObject booking = _liferayClient.get("/o/c/bookings/" + bookingId);
		String bookingStatus = booking.optJSONObject("bookingStatus").optString("key");

		if ("pendingPayment".equals(bookingStatus)) {
			_liferayClient.patch("/o/c/bookings/" + bookingId, new JSONObject().put("bookingStatus", "confirmed"));
		}
		else {
			_log.warn("Payment {} succeeded for booking {} in status {}; not changed", payload.entryId(), bookingId, bookingStatus);
		}

		return ResponseEntity.ok("{}");
	}

	private static final Logger _log = LoggerFactory.getLogger(PaymentActionRestController.class);

	private final LiferayClient _liferayClient;

}
