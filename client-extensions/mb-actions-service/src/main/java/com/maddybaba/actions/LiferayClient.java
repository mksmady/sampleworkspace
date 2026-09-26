package com.maddybaba.actions;

import com.liferay.client.extension.util.spring.boot3.client.LiferayOAuth2AccessTokenManager;

import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Paths are passed as plain text; the client URL-encodes them. In filters, relationship IDs are
 * compared as strings: ?filter=r_listingSlots_c_listingId eq '123'.
 *
 * Calls Liferay's headless APIs as the service itself (the mb-actions-service-oahs OAuth2 app, which
 * acts as the instance administrator). Handlers never use the JWT of the user who triggered them.
 */
@Component
public class LiferayClient {

	public LiferayClient(
		LiferayOAuth2AccessTokenManager liferayOAuth2AccessTokenManager,
		@Value("${com.liferay.lxc.dxp.mainDomain}") String mainDomain,
		@Value("${com.liferay.lxc.dxp.server.protocol}") String protocol) {

		_liferayOAuth2AccessTokenManager = liferayOAuth2AccessTokenManager;

		_restClient = RestClient.builder(
		).baseUrl(
			protocol + "://" + mainDomain
		).defaultHeader(
			HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE
		).build();
	}

	public JSONObject get(String path) {
		return new JSONObject(
			_restClient.get(
			).uri(
				path
			).header(
				HttpHeaders.AUTHORIZATION, _authorization()
			).retrieve(
			).body(
				String.class
			));
	}

	/**
	 * Like get, but returns null when the entry doesn't exist (404).
	 */
	public JSONObject getOrNull(String path) {
		String body = _restClient.get(
		).uri(
			path
		).header(
			HttpHeaders.AUTHORIZATION, _authorization()
		).exchange(
			(request, response) -> (response.getStatusCode().value() == 404) ? null : new String(response.getBody().readAllBytes())
		);

		return (body == null) ? null : new JSONObject(body);
	}

	/**
	 * Returns every item of a collection, following the pages.
	 */
	public List<JSONObject> getAll(String path) {
		List<JSONObject> items = new ArrayList<>();
		String separator = path.contains("?") ? "&" : "?";

		for (int page = 1;; page++) {
			JSONObject response = get(path + separator + "page=" + page + "&pageSize=200");
			JSONArray jsonArray = response.getJSONArray("items");

			for (int i = 0; i < jsonArray.length(); i++) {
				items.add(jsonArray.getJSONObject(i));
			}

			if (page >= response.optInt("lastPage", 1)) {
				return items;
			}
		}
	}

	public void patch(String path, JSONObject body) {
		_log.info("PATCH {} {}", path, body);

		_restClient.patch(
		).uri(
			path
		).header(
			HttpHeaders.AUTHORIZATION, _authorization()
		).contentType(
			MediaType.APPLICATION_JSON
		).body(
			body.toString()
		).retrieve(
		).toBodilessEntity();
	}

	public void post(String path, JSONObject body) {
		_log.info("POST {} {}", path, body);

		_restClient.post(
		).uri(
			path
		).header(
			HttpHeaders.AUTHORIZATION, _authorization()
		).contentType(
			MediaType.APPLICATION_JSON
		).body(
			body.toString()
		).retrieve(
		).toBodilessEntity();
	}

	public void put(String path, String body) {
		_log.info("PUT {} {}", path, body);

		_restClient.put(
		).uri(
			path
		).header(
			HttpHeaders.AUTHORIZATION, _authorization()
		).contentType(
			MediaType.APPLICATION_JSON
		).body(
			body
		).retrieve(
		).toBodilessEntity();
	}

	private String _authorization() {
		return _liferayOAuth2AccessTokenManager.getAuthorization("mb-actions-service-oahs");
	}

	private static final Logger _log = LoggerFactory.getLogger(LiferayClient.class);

	private final LiferayOAuth2AccessTokenManager _liferayOAuth2AccessTokenManager;
	private final RestClient _restClient;

}
