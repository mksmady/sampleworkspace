package com.maddybaba.search;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.json.JSONObject;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Component;

/**
 * Writes every search to MB_SearchQueryLog (docs/search.md section 9) in the background, so logging
 * never slows a search down or fails it.
 */
@Component
public class QueryLogger {

	public QueryLogger(LiferayClient liferayClient) {
		_liferayClient = liferayClient;
	}

	public void log(Map<String, String> params, int resultCount) {
		String source = params.getOrDefault("source", "web");
		JSONObject filters = new JSONObject();

		params.forEach(
			(name, value) -> {
				if (!name.equals("q") && !name.equals("source") && !value.isBlank()) {
					filters.put(name, value);
				}
			});

		JSONObject entry = new JSONObject(
		).put(
			"filtersUsed", filters.toString()
		).put(
			"queryText", params.getOrDefault("q", "").trim()
		).put(
			"resultCount", resultCount
		).put(
			"searchedAt", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString()
		).put(
			"source", _SOURCES.contains(source) ? source : "web"
		);

		_executorService.submit(
			() -> {
				try {
					_liferayClient.post("/o/c/searchquerylogs", entry);
				}
				catch (Exception exception) {
					_log.warn("Could not log search {}: {}", entry, exception.getMessage());
				}
			});
	}

	private static final Set<String> _SOURCES = Set.of("app", "hostLink", "web");

	private static final Logger _log = LoggerFactory.getLogger(QueryLogger.class);

	private final ExecutorService _executorService = Executors.newSingleThreadExecutor();
	private final LiferayClient _liferayClient;

}
