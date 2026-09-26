package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.math.BigDecimal;

import org.json.JSONObject;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Commission add or update: store amount = baseAmount x rate / 100 (overwriting any client value).
 */
@RequestMapping("/object/action/commission")
@RestController
public class CommissionActionRestController extends BaseRestController {

	public CommissionActionRestController(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);
		BigDecimal amount = Money.percentOf(payload.decimal("baseAmount"), payload.decimal("rate"));

		if (!Money.same(amount, payload.values().opt("amount"))) {
			_liferayClient.patch("/o/c/commissions/" + payload.entryId(), new JSONObject().put("amount", amount));
		}

		return ResponseEntity.ok("{}");
	}

	private final LiferayClient _liferayClient;

}
