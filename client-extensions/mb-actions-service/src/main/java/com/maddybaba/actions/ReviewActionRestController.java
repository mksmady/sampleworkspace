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
 * Review add, update or delete: copy the review's host and reviewer fields (ReviewRefresher), then
 * recalculate ratingValue and reviewCount on the listing and host it belongs (or belonged) to.
 */
@RequestMapping("/object/action/review")
@RestController
public class ReviewActionRestController extends BaseRestController {

	public ReviewActionRestController(
		HostRefresher hostRefresher, LiferayClient liferayClient, ListingRefresher listingRefresher,
		ReviewRefresher reviewRefresher) {

		_hostRefresher = hostRefresher;
		_liferayClient = liferayClient;
		_listingRefresher = listingRefresher;
		_reviewRefresher = reviewRefresher;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.trusted(json, _liferayClient, "reviews");

		if (payload == null) {
			return ResponseEntity.ok("{}");
		}

		if (!"onAfterDelete".equals(payload.trigger())) {
			_reviewRefresher.refresh(payload.entryId());
		}

		for (long listingId : new LinkedHashSet<>(List.of(payload.id(_LISTING), payload.originalId(_LISTING)))) {
			_listingRefresher.refresh(listingId);
		}

		for (long hostId : new LinkedHashSet<>(List.of(payload.id(_HOST), payload.originalId(_HOST)))) {
			_hostRefresher.refresh(hostId);
		}

		return ResponseEntity.ok("{}");
	}

	private static final String _HOST = "r_hostReviews_c_hostId";

	private static final String _LISTING = "r_listingReviews_c_listingId";

	private final HostRefresher _hostRefresher;
	private final LiferayClient _liferayClient;
	private final ListingRefresher _listingRefresher;
	private final ReviewRefresher _reviewRefresher;

}
