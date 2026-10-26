package com.maddybaba.actions;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

import org.json.JSONObject;

/**
 * Rating and review count from published reviews only (docs/data-model.md 3.3 and 3.6). Aggregation
 * filters can't use the Boolean isPublished, so these are stored values. The rating has one decimal
 * ("4.9") and is 0 when there are no published reviews: Liferay stores an empty PrecisionDecimal as 0.
 */
public record Ratings(BigDecimal ratingValue, int reviewCount) {

	public static Ratings of(List<JSONObject> reviews) {
		List<JSONObject> published = reviews.stream(
		).filter(
			review -> review.optBoolean("isPublished")
		).toList();

		if (published.isEmpty()) {
			return new Ratings(BigDecimal.ZERO, 0);
		}

		BigDecimal sum = published.stream(
		).map(
			review -> BigDecimal.valueOf(review.optLong("rating"))
		).reduce(
			BigDecimal.ZERO, BigDecimal::add
		);

		return new Ratings(sum.divide(BigDecimal.valueOf(published.size()), 1, RoundingMode.HALF_UP), published.size());
	}

}
