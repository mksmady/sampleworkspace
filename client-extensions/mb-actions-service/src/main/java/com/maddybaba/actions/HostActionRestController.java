package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.json.JSONArray;
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
 * Host actions (docs/data-model.md section 7), on the stored host (ActionPayload trust rule):
 * - add: set termsAcceptedDate when the terms were accepted.
 * - update that approved the host (KYC, MB Ops Approval): create or reuse the host's Account, link the
 *   Host to it, give the host's user the Host account role and the regular Traveler role (6.2) and set
 *   hostStatus = active. The service's own follow-up update is approved automatically.
 * - add or update: refresh the host's derived fields and its destination's hostCount (HostRefresher);
 *   when displayName or the destination changed, its listings, reviews and previous destination too.
 */
@RequestMapping("/object/action/host")
@RestController
public class HostActionRestController extends BaseRestController {

	public HostActionRestController(
		HostRefresher hostRefresher, LiferayClient liferayClient, ListingRefresher listingRefresher,
		ReviewRefresher reviewRefresher, WorkflowApprover workflowApprover) {

		_hostRefresher = hostRefresher;
		_liferayClient = liferayClient;
		_listingRefresher = listingRefresher;
		_reviewRefresher = reviewRefresher;
		_workflowApprover = workflowApprover;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.trusted(json, _liferayClient, "hosts");

		if (payload == null) {
			return ResponseEntity.ok("{}");
		}

		long hostId = payload.entryId();

		_log.info("Host {} {}: status {} (was {})", hostId, payload.trigger(), payload.status(), payload.originalStatus());

		if ("onAfterAdd".equals(payload.trigger()) && payload.values().optBoolean("termsAccepted") &&
			payload.values().optString("termsAcceptedDate", "").isEmpty()) {

			_liferayClient.patch(
				"/o/c/hosts/" + hostId, new JSONObject().put("termsAcceptedDate", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()));
		}

		if (payload.justApproved()) {
			_onboard(hostId);
		}

		_hostRefresher.refresh(hostId);

		long originalDestinationId = payload.originalId(_DESTINATION);

		if (originalDestinationId != payload.id(_DESTINATION)) {
			_hostRefresher.refreshDestination(originalDestinationId);
		}

		boolean renamed = !payload.values().optString("displayName").equals(payload.originalString("displayName"));

		if (renamed || (originalDestinationId != payload.id(_DESTINATION))) {
			_listingRefresher.refreshAll("r_hostListings_c_hostId", hostId);
			_reviewRefresher.refreshForHost(hostId);
		}

		return ResponseEntity.ok("{}");
	}

	private long _account(JSONObject host) {
		long accountId = host.optLong("r_accountHosts_accountEntryId", 0);

		if (accountId > 0) {
			return accountId;
		}

		String erc = "MB_account_" + host.getString("externalReferenceCode");
		JSONObject account = _liferayClient.getOrNull(_USERS + "/accounts/by-external-reference-code/" + erc);

		if (account == null) {
			account = _liferayClient.post(
				_USERS + "/accounts",
				new JSONObject().put("externalReferenceCode", erc).put("name", host.optString("displayName")).put("type", "business"));
		}

		return account.getLong("id");
	}

	/**
	 * Adds the host's user to the account with the Host account role, and gives them the regular
	 * Traveler role. Steps already done are skipped, so running it again changes nothing.
	 */
	private void _grantAccess(JSONObject host, long accountId) {
		long userId = host.optLong("r_userHost_userId", 0);

		if (userId <= 0) {
			_log.info("Host {} has no user; account {} created without members", host.getLong("id"), accountId);

			return;
		}

		JSONObject user = _liferayClient.get(_USERS + "/user-accounts/" + userId);
		String accountERC = _liferayClient.get(_USERS + "/accounts/" + accountId).getString("externalReferenceCode");
		String email = user.getString("emailAddress");

		if (!_contains(user.optJSONArray("accountBriefs"), "id", String.valueOf(accountId))) {
			_liferayClient.post(_USERS + "/accounts/" + accountId + "/user-accounts/by-email-address/" + email, new JSONObject());
		}

		if (!_contains(user.optJSONArray("roleBriefs"), "externalReferenceCode", "MB_Traveler")) {
			_liferayClient.post(_USERS + "/roles/by-external-reference-code/MB_Traveler/association/user-account/" + userId, new JSONObject());
		}

		String rolesPath = _USERS + "/accounts/by-external-reference-code/" + accountERC + "/user-accounts/by-email-address/" + email + "/account-roles";

		for (JSONObject role : _liferayClient.getAll(rolesPath)) {
			if ("MB_Host".equals(role.optString("externalReferenceCode"))) {
				return;
			}
		}

		_liferayClient.post(
			_USERS + "/accounts/by-external-reference-code/" + accountERC +
				"/account-roles/by-external-reference-code/MB_Host/user-accounts/by-email-address/" + email,
			new JSONObject());
	}

	private static boolean _contains(JSONArray briefs, String field, String value) {
		for (int i = 0; (briefs != null) && (i < briefs.length()); i++) {
			if (value.equals(briefs.getJSONObject(i).optString(field))) {
				return true;
			}
		}

		return false;
	}

	private void _onboard(long hostId) {
		JSONObject host = _liferayClient.get("/o/c/hosts/" + hostId);
		long accountId = _account(host);

		_grantAccess(host, accountId);

		JSONObject patch = new JSONObject();

		if (host.optLong("r_accountHosts_accountEntryId", 0) != accountId) {
			patch.put("r_accountHosts_accountEntryId", accountId);
		}

		if (!"active".equals(Values.key(host.opt("hostStatus")))) {
			patch.put("hostStatus", "active");
		}

		if (!patch.isEmpty()) {
			_liferayClient.patch("/o/c/hosts/" + hostId, patch);
			_workflowApprover.approveAutomaticUpdate(hostId);
		}

		_log.info("Host {} onboarded: account {}", hostId, accountId);
	}

	private static final String _DESTINATION = "r_destinationHosts_c_destinationId";

	private static final String _USERS = "/o/headless-admin-user/v1.0";

	private static final Logger _log = LoggerFactory.getLogger(HostActionRestController.class);

	private final HostRefresher _hostRefresher;
	private final LiferayClient _liferayClient;
	private final ListingRefresher _listingRefresher;
	private final ReviewRefresher _reviewRefresher;
	private final WorkflowApprover _workflowApprover;

}
