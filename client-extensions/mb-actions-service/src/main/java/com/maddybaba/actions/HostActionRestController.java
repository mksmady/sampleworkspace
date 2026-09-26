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
 * Host actions (docs/data-model.md section 7):
 * - add: set termsAcceptedDate when the terms were accepted.
 * - update that approves the host (KYC, MB Ops Approval): create or reuse the host's Account, link the
 *   Host to it, give the host's user the Host (or Super Host) account role and set hostStatus = active.
 *   The service's own follow-up update is approved automatically.
 * - update of displayName: refresh the host's listings.
 */
@RequestMapping("/object/action/host")
@RestController
public class HostActionRestController extends BaseRestController {

	public HostActionRestController(
		LiferayClient liferayClient, ListingRefresher listingRefresher, WorkflowApprover workflowApprover) {

		_liferayClient = liferayClient;
		_listingRefresher = listingRefresher;
		_workflowApprover = workflowApprover;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.of(json);

		_log.info("Host {} {}: status {} (was {})", payload.entryId(), payload.trigger(), payload.status(), payload.originalStatus());

		if ("onAfterAdd".equals(payload.trigger())) {
			if (payload.values().optBoolean("termsAccepted") && _isEmpty(payload.values().opt("termsAcceptedDate"))) {
				_liferayClient.patch(
					"/o/c/hosts/" + payload.entryId(),
					new JSONObject().put("termsAcceptedDate", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()));
			}

			return ResponseEntity.ok("{}");
		}

		if (payload.justApproved()) {
			_onboard(payload.entryId());
		}

		if (!payload.values().optString("displayName").equals(
				(payload.originalValues() == null) ? "" : payload.originalValues().optString("displayName"))) {

			_listingRefresher.refreshAll("r_hostListings_c_hostId", payload.entryId());
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
	 * Adds the host's user to the account with the account role that matches the tier. Steps already
	 * done are skipped, so running it again changes nothing.
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
		boolean member = false;
		JSONArray accountBriefs = user.optJSONArray("accountBriefs");

		for (int i = 0; (accountBriefs != null) && (i < accountBriefs.length()); i++) {
			member |= accountBriefs.getJSONObject(i).optLong("id") == accountId;
		}

		if (!member) {
			_liferayClient.post(_USERS + "/accounts/" + accountId + "/user-accounts/by-email-address/" + email, new JSONObject());
		}

		String roleERC = "superHost".equals(_key(host.opt("tier"))) ? "MB_SuperHost" : "MB_Host";
		String rolesPath = _USERS + "/accounts/by-external-reference-code/" + accountERC + "/user-accounts/by-email-address/" + email + "/account-roles";

		for (JSONObject role : _liferayClient.getAll(rolesPath)) {
			if (roleERC.equals(role.optString("externalReferenceCode"))) {
				return;
			}
		}

		_liferayClient.post(
			_USERS + "/accounts/by-external-reference-code/" + accountERC + "/account-roles/by-external-reference-code/" + roleERC +
				"/user-accounts/by-email-address/" + email,
			new JSONObject());
	}

	private static boolean _isEmpty(Object value) {
		return (value == null) || (value == JSONObject.NULL) || "".equals(value.toString());
	}

	private static String _key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return (picklistValue == null) ? "" : picklistValue.toString();
	}

	private void _onboard(long hostId) {
		JSONObject host = _liferayClient.get("/o/c/hosts/" + hostId);
		long accountId = _account(host);

		_grantAccess(host, accountId);

		JSONObject patch = new JSONObject();

		if (host.optLong("r_accountHosts_accountEntryId", 0) != accountId) {
			patch.put("r_accountHosts_accountEntryId", accountId);
		}

		if (!"active".equals(_key(host.opt("hostStatus")))) {
			patch.put("hostStatus", "active");
		}

		if (!patch.isEmpty()) {
			_liferayClient.patch("/o/c/hosts/" + hostId, patch);
			_workflowApprover.approveAutomaticUpdate(hostId);
		}

		_log.info("Host {} onboarded: account {}", hostId, accountId);
	}

	private static final String _USERS = "/o/headless-admin-user/v1.0";

	private static final Logger _log = LoggerFactory.getLogger(HostActionRestController.class);

	private final LiferayClient _liferayClient;
	private final ListingRefresher _listingRefresher;
	private final WorkflowApprover _workflowApprover;

}
