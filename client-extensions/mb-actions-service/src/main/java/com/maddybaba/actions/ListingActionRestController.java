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
 * Keeps derived fields current when a Listing or Destination changes (Host: HostActionRestController,
 * Review: ReviewActionRestController, slots: AvailabilitySlotActionRestController):
 * - Listing add, update (including its approval) or delete: the listing itself and its host's
 *   priceFrom and completeTripsFrom (approved listings only).
 * - Destination update: its hosts, listings and their reviews, when a copied field changed.
 */
@RequestMapping("/object/action")
@RestController
public class ListingActionRestController extends BaseRestController {

	public ListingActionRestController(
		HostRefresher hostRefresher, LiferayClient liferayClient, ListingRefresher listingRefresher,
		ReviewRefresher reviewRefresher) {

		_hostRefresher = hostRefresher;
		_liferayClient = liferayClient;
		_listingRefresher = listingRefresher;
		_reviewRefresher = reviewRefresher;
	}

	@PostMapping("/destination")
	public ResponseEntity<String> destination(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.trusted(json, _liferayClient, "destinations");

		if (payload == null) {
			return ResponseEntity.ok("{}");
		}

		boolean changed = (payload.originalValues() == null) || _COPIED_FIELDS.stream(
		).anyMatch(
			name -> !String.valueOf(payload.values().opt(name)).equals(String.valueOf(payload.originalValues().opt(name)))
		);

		if (changed) {
			_listingRefresher.refreshAll("r_destinationListings_c_destinationId", payload.entryId());

			for (var host : _liferayClient.getAll("/o/c/hosts?filter=r_destinationHosts_c_destinationId eq '" + payload.entryId() + "'")) {
				_hostRefresher.refresh(host.getLong("id"));
				_reviewRefresher.refreshForHost(host.getLong("id"));
			}
		}

		return ResponseEntity.ok("{}");
	}

	@PostMapping("/listing")
	public ResponseEntity<String> listing(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.trusted(json, _liferayClient, "listings");

		if (payload == null) {
			return ResponseEntity.ok("{}");
		}

		if (!"onAfterDelete".equals(payload.trigger())) {
			_listingRefresher.refresh(payload.entryId());
		}

		for (long hostId : new LinkedHashSet<>(List.of(payload.id(_HOST), payload.originalId(_HOST)))) {
			_hostRefresher.refresh(hostId);
		}

		return ResponseEntity.ok("{}");
	}

	private static final List<String> _COPIED_FIELDS = List.of("latitude", "longitude", "name", "region", "state");

	private static final String _HOST = "r_hostListings_c_hostId";

	private final HostRefresher _hostRefresher;
	private final LiferayClient _liferayClient;
	private final ListingRefresher _listingRefresher;
	private final ReviewRefresher _reviewRefresher;

}
