package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.util.LinkedHashSet;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AvailabilitySlot add or update: mark the slot full when bookedCount reaches capacity (and open again
 * when capacity is raised). Add, update or delete: refresh the listing's nextAvailableDate.
 */
@RequestMapping("/object/action/availability-slot")
@RestController
public class AvailabilitySlotActionRestController extends BaseRestController {

	public AvailabilitySlotActionRestController(ListingRefresher listingRefresher, Recalculator recalculator) {
		_listingRefresher = listingRefresher;
		_recalculator = recalculator;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);

		if (!"onAfterDelete".equals(payload.trigger())) {
			_recalculator.slotStatus(payload.entryId());
		}

		for (long listingId : new LinkedHashSet<>(List.of(payload.id(_LISTING), payload.originalId(_LISTING)))) {
			_listingRefresher.refresh(listingId);
		}

		return ResponseEntity.ok("{}");
	}

	private static final String _LISTING = "r_listingSlots_c_listingId";

	private final ListingRefresher _listingRefresher;
	private final Recalculator _recalculator;

}
