package com.maddybaba.search;

import java.time.format.DateTimeParseException;
import java.util.Map;

import org.json.JSONObject;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public, read-only search API (docs/search.md section 8). No login: guests search too. Everything
 * returned comes from the approved/active catalog through the public-field whitelists.
 */
@RequestMapping(path = "/search", produces = MediaType.APPLICATION_JSON_VALUE)
@RestController
public class SearchRestController {

	public SearchRestController(QueryLogger queryLogger, TripSearch tripSearch) {
		_queryLogger = queryLogger;
		_tripSearch = tripSearch;
	}

	@ExceptionHandler({DateTimeParseException.class, IllegalArgumentException.class})
	public ResponseEntity<String> badRequest(Exception exception) {
		return ResponseEntity.badRequest().body(new JSONObject().put("error", exception.getMessage()).toString());
	}

	@GetMapping("/hosts/{handle}")
	public ResponseEntity<String> host(@PathVariable String handle) {
		return _found(_tripSearch.host(handle));
	}

	@GetMapping("/listings/{slug}")
	public ResponseEntity<String> listing(@PathVariable String slug) {
		return _found(_tripSearch.listing(slug));
	}

	@GetMapping("/suggest")
	public String suggest(@RequestParam(defaultValue = "") String q) {
		return _tripSearch.suggest(q).toString();
	}

	@GetMapping("/trips")
	public String trips(@RequestParam Map<String, String> params) {
		JSONObject response = _tripSearch.search(params);

		_queryLogger.log(params, response.getInt("totalCount"));

		return response.toString();
	}

	private static ResponseEntity<String> _found(JSONObject jsonObject) {
		if (jsonObject == null) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).body("{\"error\":\"Not found\"}");
		}

		return ResponseEntity.ok(jsonObject.toString());
	}

	private final QueryLogger _queryLogger;
	private final TripSearch _tripSearch;

}
