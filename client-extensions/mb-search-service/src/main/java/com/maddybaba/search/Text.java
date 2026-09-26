package com.maddybaba.search;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Text helpers for matching: lower case, accents and punctuation removed, split into words; and the
 * typo tolerance of Elasticsearch's fuzziness AUTO (0 edits up to 2 letters, 1 up to 5, then 2).
 */
public final class Text {

	public static int allowedEdits(String word) {
		if (word.length() <= 2) {
			return 0;
		}

		return (word.length() <= 5) ? 1 : 2;
	}

	/**
	 * Levenshtein distance, stopping early once it exceeds max.
	 */
	public static boolean withinEdits(String a, String b, int max) {
		if (Math.abs(a.length() - b.length()) > max) {
			return false;
		}

		int[] previous = new int[b.length() + 1];
		int[] current = new int[b.length() + 1];

		for (int j = 0; j <= b.length(); j++) {
			previous[j] = j;
		}

		for (int i = 1; i <= a.length(); i++) {
			current[0] = i;

			int rowMin = current[0];

			for (int j = 1; j <= b.length(); j++) {
				int cost = (a.charAt(i - 1) == b.charAt(j - 1)) ? 0 : 1;

				current[j] = Math.min(Math.min(current[j - 1] + 1, previous[j] + 1), previous[j - 1] + cost);
				rowMin = Math.min(rowMin, current[j]);
			}

			if (rowMin > max) {
				return false;
			}

			int[] swap = previous;

			previous = current;
			current = swap;
		}

		return previous[b.length()] <= max;
	}

	public static String normalize(String text) {
		if (text == null) {
			return "";
		}

		String plain = Normalizer.normalize(text.replaceAll("<[^>]*>", " "), Normalizer.Form.NFD).replaceAll("\\p{M}", "");

		return plain.toLowerCase(Locale.ENGLISH).replaceAll("[^a-z0-9]+", " ").trim();
	}

	public static List<String> words(String text) {
		String normalized = normalize(text);

		return normalized.isEmpty() ? new ArrayList<>() : new ArrayList<>(Arrays.asList(normalized.split(" ")));
	}

	private Text() {
	}

}
