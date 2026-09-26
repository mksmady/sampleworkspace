package com.maddybaba.search;

import com.liferay.client.extension.util.spring.boot3.client.LiferayOAuth2AccessTokenManager;

import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Calls Liferay's headless APIs as the service (the mb-search-service-oahs OAuth2 app, which acts as the
 * instance administrator and so sees everything: callers must only pass on what the public may see).
 * Paths are plain text; the client URL-encodes them. Relationship IDs in filters are quoted strings.
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

	/**
	 * Every item of a collection, following the pages.
	 */
	public List<JSONObject> getAll(String path) {
		List<JSONObject> items = new ArrayList<>();
		String separator = path.contains("?") ? "&" : "?";

		for (int page = 1;; page++) {
			JSONObject response = new JSONObject(
				_restClient.get(
				).uri(
					path + separator + "page=" + page + "&pageSize=200"
				).header(
					HttpHeaders.AUTHORIZATION, _authorization()
				).retrieve(
				).body(
					String.class
				));

			JSONArray jsonArray = response.getJSONArray("items");

			for (int i = 0; i < jsonArray.length(); i++) {
				items.add(jsonArray.getJSONObject(i));
			}

			if (page >= response.optInt("lastPage", 1)) {
				return items;
			}
		}
	}

	public void post(String path, JSONObject body) {
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

	private String _authorization() {
		return _liferayOAuth2AccessTokenManager.getAuthorization("mb-search-service-oahs");
	}

	private final LiferayOAuth2AccessTokenManager _liferayOAuth2AccessTokenManager;
	private final RestClient _restClient;

}
