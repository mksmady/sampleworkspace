package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.BaseRestController;

import java.util.List;

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
import org.springframework.web.client.HttpClientErrorException;

/**
 * HostApplication add (docs/data-model.md 3.19 and 7.1, docs/website.md 4): applies a signed-in user's
 * host sign-up or profile edit to their Host. Hosts only have View on Host, so the service writes it.
 *
 * The stored application is re-read (ActionPayload trust rule) and its user is its creator, which
 * Liferay sets: nothing in a request can name another user or host. Only the profile fields below are
 * ever written. The outcome goes back to the application: applied (linked to the Host), or rejected with
 * Liferay's validation messages. A new or edited Host goes to Ops review (MB Ops Approval).
 */
@RequestMapping("/object/action/host-application")
@RestController
public class HostApplicationActionRestController extends BaseRestController {

	public HostApplicationActionRestController(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	@PostMapping
	public ResponseEntity<String> post(@AuthenticationPrincipal Jwt jwt, @RequestBody String json) {
		ActionPayload payload = ActionPayload.trusted(json, _liferayClient, "hostapplications");

		if ((payload == null) || !"submitted".equals(payload.key("applicationStatus"))) {
			return ResponseEntity.ok("{}");
		}

		long applicationId = payload.entryId();
		JSONObject application = _liferayClient.get("/o/c/hostapplications/" + applicationId);
		long userId = application.getJSONObject("creator").getLong("id");
		JSONObject host = _host(userId);

		try {
			if ("signUp".equals(payload.key("applicationType"))) {
				if (host != null) {
					_result(applicationId, "rejected", "You already have a host profile.", host);

					return ResponseEntity.ok("{}");
				}

				host = _liferayClient.post(
					"/o/c/hosts",
					_profile(
						payload.values()
					).put(
						"externalReferenceCode", "MB_host_user_" + userId
					).put(
						"handle", payload.values().optString("handle", "").trim().toLowerCase()
					).put(
						"hostStatus", "pendingVerification"
					).put(
						"r_userHost_userId", userId
					).put(
						"termsAccepted", payload.values().optBoolean("termsAccepted")
					));

				_log.info("Application {}: user {} signed up as host {}; awaiting Ops review", applicationId, userId, host.optLong("id"));
			}
			else {
				if (host == null) {
					_result(applicationId, "rejected", "You don't have a host profile yet.", null);

					return ResponseEntity.ok("{}");
				}

				JSONObject patch = _profile(payload.values());

				if (!patch.isEmpty()) {
					_liferayClient.patch("/o/c/hosts/" + host.getLong("id"), patch);
				}

				_log.info("Application {}: user {} edited host {}; awaiting Ops review", applicationId, userId, host.getLong("id"));
			}
		}
		catch (HttpClientErrorException httpClientErrorException) {
			_result(applicationId, "rejected", _messages(httpClientErrorException), host);

			return ResponseEntity.ok("{}");
		}

		_result(applicationId, "applied", "", (host == null) ? _host(userId) : host);

		return ResponseEntity.ok("{}");
	}

	private JSONObject _host(long userId) {
		List<JSONObject> hosts = _liferayClient.getAll("/o/c/hosts?filter=r_userHost_userId eq '" + userId + "'");

		return hosts.isEmpty() ? null : hosts.get(0);
	}

	/**
	 * Liferay's validation rule messages ({"detail": "[{errorMessage}]"}) or its title, as one line.
	 */
	private static String _messages(HttpClientErrorException httpClientErrorException) {
		try {
			JSONObject body = new JSONObject(httpClientErrorException.getResponseBodyAsString());
			String detail = body.optString("detail", "");

			if (detail.startsWith("[")) {
				JSONArray items = new JSONArray(detail);
				StringBuilder sb = new StringBuilder();

				for (int i = 0; i < items.length(); i++) {
					sb.append((i > 0) ? " " : "").append(items.getJSONObject(i).optString("errorMessage"));
				}

				return sb.toString();
			}

			String title = body.optString("title", "");

			return title.contains("handle") ? "That booking link is taken; try another." : title;
		}
		catch (Exception exception) {
			return "The profile couldn't be saved.";
		}
	}

	/**
	 * The profile fields of an application (data-model.md 7.1): non-empty text, picklists as keys, the
	 * destination as its ID. Nothing else is copied to the Host.
	 */
	private static JSONObject _profile(JSONObject values) {
		JSONObject profile = new JSONObject();

		for (String name : List.of("bio", "displayName", "phone", "quote")) {
			String value = values.optString(name, "").trim();

			if (!value.isEmpty()) {
				profile.put(name, value);
			}
		}

		if (!values.optString("hostRole", "").isEmpty()) {
			profile.put("hostRole", values.optString("hostRole"));
		}

		for (String name : List.of("hostOffers", "specialties")) {
			JSONArray keys = values.optJSONArray(name);

			if ((keys != null) && !keys.isEmpty()) {
				JSONArray picklist = new JSONArray();

				for (int i = 0; i < keys.length(); i++) {
					picklist.put(new JSONObject().put("key", keys.optString(i)));
				}

				profile.put(name, picklist);
			}
		}

		long destinationId = values.optLong("r_destinationHostApplications_c_destinationId", 0);

		if (destinationId > 0) {
			profile.put("r_destinationHosts_c_destinationId", destinationId);
		}

		return profile;
	}

	private void _result(long applicationId, String status, String message, JSONObject host) {
		JSONObject patch = new JSONObject().put("applicationStatus", status).put("resultMessage", message);

		if ((host != null) && host.has("id")) {
			patch.put("r_hostApplications_c_hostId", host.getLong("id"));
		}

		_liferayClient.patch("/o/c/hostapplications/" + applicationId, patch);
	}

	private static final Logger _log = LoggerFactory.getLogger(HostApplicationActionRestController.class);

	private final LiferayClient _liferayClient;

}
