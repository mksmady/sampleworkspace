package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;

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
 * Payout actions (docs/data-model.md section 7):
 * - add (payoutStatus requested): link the host's free available commissions to the payout, oldest
 *   first, while their total fits the requested amount. The gateway call is phase 7c (logged).
 * - payoutStatus becomes paid: linked commissions become paidOut; processedAt is set.
 * - payoutStatus becomes failed: linked commissions are released (they stay available).
 */
@RequestMapping("/object/action/payout")
@RestController
public class PayoutActionRestController extends BaseRestController {

	public PayoutActionRestController(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);
		long payoutId = payload.entryId();
		String status = payload.key("payoutStatus");

		if ("onAfterAdd".equals(payload.trigger())) {
			if ("requested".equals(status)) {
				_link(payoutId, payload.id("r_hostPayouts_c_hostId"), payload.decimal("amount"));
				_log.info("PAYOUT GATEWAY: payout {} requested (gateway call is phase 7c)", payoutId);
			}

			return ResponseEntity.ok("{}");
		}

		if (status.equals(payload.originalKey("payoutStatus"))) {
			return ResponseEntity.ok("{}");
		}

		if ("paid".equals(status)) {
			for (JSONObject commission : _linked(payoutId)) {
				_liferayClient.patch("/o/c/commissions/" + commission.getLong("id"), new JSONObject().put("commissionStatus", "paidOut"));
			}

			if (payload.values().opt("processedAt") == null || "".equals(payload.values().optString("processedAt"))) {
				_liferayClient.patch(
					"/o/c/payouts/" + payoutId, new JSONObject().put("processedAt", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()));
			}
		}
		else if ("failed".equals(status)) {
			for (JSONObject commission : _linked(payoutId)) {
				_liferayClient.patch("/o/c/commissions/" + commission.getLong("id"), new JSONObject().put("r_payoutCommissions_c_payoutId", 0));
			}
		}

		return ResponseEntity.ok("{}");
	}

	private void _link(long payoutId, long hostId, BigDecimal amount) {
		if (hostId <= 0) {
			return;
		}

		List<JSONObject> free = _liferayClient.getAll(
			"/o/c/commissions?filter=r_hostCommissions_c_hostId eq '" + hostId + "'"
		).stream(
		).filter(
			commission -> "available".equals(commission.optJSONObject("commissionStatus").optString("key"))
		).filter(
			commission -> commission.optLong("r_payoutCommissions_c_payoutId", 0) == 0
		).sorted(
			Comparator.comparing((JSONObject commission) -> commission.optString("availableOn")).thenComparing(commission -> commission.getLong("id"))
		).toList();

		BigDecimal linked = BigDecimal.ZERO;

		for (JSONObject commission : free) {
			BigDecimal next = linked.add(Money.of(commission.opt("amount")));

			if (next.compareTo(amount) > 0) {
				break;
			}

			_liferayClient.patch("/o/c/commissions/" + commission.getLong("id"), new JSONObject().put("r_payoutCommissions_c_payoutId", payoutId));
			linked = next;
		}

		if (linked.compareTo(amount) != 0) {
			_log.warn("Payout {}: requested {} but whole commissions only cover {}", payoutId, amount, linked);
		}
	}

	private List<JSONObject> _linked(long payoutId) {
		return _liferayClient.getAll("/o/c/commissions?filter=r_payoutCommissions_c_payoutId eq '" + payoutId + "'");
	}

	private static final Logger _log = LoggerFactory.getLogger(PayoutActionRestController.class);

	private final LiferayClient _liferayClient;

}
