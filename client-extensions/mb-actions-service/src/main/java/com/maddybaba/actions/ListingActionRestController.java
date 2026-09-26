package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Keeps each Listing's derived fields current (ListingRefresher):
 * - Listing add or update: the listing itself.
 * - Destination or Host update: their listings, when a copied field changed.
 * - Review add, update or delete: the listing it belongs (or belonged) to (slots: see
 *   AvailabilitySlotActionRestController).
 */
@RequestMapping("/object/action")
@RestController
public class ListingActionRestController extends BaseRestController {

	public ListingActionRestController(ListingRefresher listingRefresher) {
		_listingRefresher = listingRefresher;
	}

	@PostMapping("/listing")
	public ResponseEntity<String> listing(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		_listingRefresher.refresh(ActionPayload.of(json).entryId());

		return ResponseEntity.ok("{}");
	}

	@PostMapping("/{source:destination|host}")
	public ResponseEntity<String> parent(
		@AuthenticationPrincipal Jwt jwt, @PathVariable String source, @RequestBody String json) {

		ActionPayload payload = ActionPayload.of(json);
		List<String> copiedFields = _COPIED_FIELDS.get(source);

		boolean changed = (payload.originalValues() == null) || copiedFields.stream(
		).anyMatch(
			name -> !String.valueOf(payload.values().opt(name)).equals(String.valueOf(payload.originalValues().opt(name)))
		);

		if (changed) {
			_listingRefresher.refreshAll(_RELATIONSHIP_FIELDS.get(source), payload.entryId());
		}

		return ResponseEntity.ok("{}");
	}

	@PostMapping("/{source:review}")
	public ResponseEntity<String> child(
		@AuthenticationPrincipal Jwt jwt, @PathVariable String source, @RequestBody String json) {

		ActionPayload payload = ActionPayload.of(json);
		String field = _LISTING_FIELDS.get(source);

		for (long listingId : new LinkedHashSet<>(List.of(payload.id(field), payload.originalId(field)))) {
			_listingRefresher.refresh(listingId);
		}

		return ResponseEntity.ok("{}");
	}

	private static final Map<String, List<String>> _COPIED_FIELDS = Map.of(
		"destination", List.of("latitude", "longitude", "name", "region", "state"), "host", List.of("displayName"));

	private static final Map<String, String> _LISTING_FIELDS = Map.of(
		"review", "r_listingReviews_c_listingId");

	private static final Map<String, String> _RELATIONSHIP_FIELDS = Map.of(
		"destination", "r_destinationListings_c_destinationId", "host", "r_hostListings_c_hostId");

	private final ListingRefresher _listingRefresher;

}
