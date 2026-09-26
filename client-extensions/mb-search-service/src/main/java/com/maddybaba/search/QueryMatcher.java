package com.maddybaba.search;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.json.JSONArray;
import org.json.JSONObject;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Text relevance (docs/search.md section 4), configured by search-config.json (synonyms, pins, stop
 * words). A query becomes concepts: a synonym phrase (with all its alternatives) or a single word. A
 * document matches when every concept matches some field; its score is the sum, per concept, of the best
 * field boost x match quality (exact word or phrase 1.0, word prefix 0.8, typo 0.6 on fuzzy fields).
 */
@Component
public class QueryMatcher {

	public record Field(String name, double boost, boolean fuzzy) {
	}

	/**
	 * One concept of the query: alternative phrases (each a list of words), any of which may match.
	 */
	public record Concept(List<List<String>> alternatives) {
	}

	public static final List<Field> DESTINATION_FIELDS = List.of(
		new Field("name", 4, true), new Field("searchKeywords", 3, true), new Field("region", 2, false), new Field("state", 2, false));

	public static final List<Field> HOST_FIELDS = List.of(
		new Field("displayName", 4, true), new Field("hostRegion", 2, false), new Field("specialties", 2, false), new Field("bio", 1, false));

	public static final List<Field> LISTING_FIELDS = List.of(
		new Field("title", 5, true), new Field("destinationName", 4, true), new Field("searchKeywords", 3, true),
		new Field("region", 2, false), new Field("stateName", 2, false), new Field("category", 2, false),
		new Field("shortDescription", 1.5, false), new Field("hostDisplayName", 1.5, false), new Field("description", 1, false));

	public QueryMatcher() throws Exception {
		JSONObject config;

		try (InputStream inputStream = new ClassPathResource("search-config.json").getInputStream()) {
			config = new JSONObject(new String(inputStream.readAllBytes(), StandardCharsets.UTF_8));
		}

		JSONArray synonyms = config.getJSONArray("synonyms");

		for (int i = 0; i < synonyms.length(); i++) {
			List<List<String>> set = new ArrayList<>();

			for (Object phrase : synonyms.getJSONArray(i)) {
				set.add(Text.words(phrase.toString()));
			}

			_synonymSets.add(set);
		}

		JSONArray pins = config.getJSONArray("pins");

		for (int i = 0; i < pins.length(); i++) {
			_pins.put(Text.normalize(pins.getJSONObject(i).getString("query")), pins.getJSONObject(i).getString("listing"));
		}

		for (Object stopWord : config.getJSONArray("stopWords")) {
			_stopWords.add(stopWord.toString());
		}
	}

	/**
	 * Splits a query into concepts, preferring the longest synonym phrase at each position.
	 */
	public List<Concept> concepts(String query) {
		List<String> words = Text.words(query);
		List<Concept> concepts = new ArrayList<>();

		for (int i = 0; i < words.size();) {
			List<List<String>> synonymSet = null;
			int length = 0;

			for (int size = Math.min(3, words.size() - i); (size >= 1) && (synonymSet == null); size--) {
				List<String> phrase = words.subList(i, i + size);

				for (List<List<String>> set : _synonymSets) {
					if (set.contains(phrase)) {
						synonymSet = set;
						length = size;

						break;
					}
				}
			}

			if (synonymSet != null) {
				concepts.add(new Concept(synonymSet));
				i += length;
			}
			else {
				if (!_stopWords.contains(words.get(i))) {
					concepts.add(new Concept(List.of(List.of(words.get(i)))));
				}

				i++;
			}
		}

		return concepts;
	}

	/**
	 * The listing ERC pinned for this query, or null.
	 */
	public String pinnedListing(String query) {
		return _pins.get(Text.normalize(query));
	}

	/**
	 * The document's score for the concepts, or -1 when a concept matches no field.
	 */
	public double score(List<Concept> concepts, List<Field> fields, Map<String, List<String>> words) {
		double total = 0;

		for (Concept concept : concepts) {
			double best = 0;

			for (Field field : fields) {
				List<String> fieldWords = words.getOrDefault(field.name(), List.of());

				for (List<String> alternative : concept.alternatives()) {
					best = Math.max(best, field.boost() * _quality(alternative, fieldWords, field.fuzzy()));
				}
			}

			if (best == 0) {
				return -1;
			}

			total += best;
		}

		return total;
	}

	private static double _quality(List<String> alternative, List<String> fieldWords, boolean fuzzy) {
		if (alternative.size() > 1) {
			return (Collections.indexOfSubList(fieldWords, alternative) >= 0) ? 1.0 : 0;
		}

		String word = alternative.get(0);

		if (fieldWords.contains(word)) {
			return 1.0;
		}

		double quality = 0;

		for (String fieldWord : fieldWords) {
			if ((word.length() >= 3) && fieldWord.startsWith(word)) {
				quality = Math.max(quality, 0.8);
			}
			else if (fuzzy && (Text.allowedEdits(word) > 0) && Text.withinEdits(word, fieldWord, Text.allowedEdits(word))) {
				quality = Math.max(quality, 0.6);
			}
		}

		return quality;
	}

	private final Map<String, String> _pins = new HashMap<>();
	private final Set<String> _stopWords = new HashSet<>();
	private final List<List<List<String>>> _synonymSets = new ArrayList<>();

}
