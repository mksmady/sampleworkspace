package com.maddybaba.actions;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * INR amounts: two decimals (paise), rounded half up. Liferay returns PrecisionDecimal values as
 * numbers or strings, and empty values as null or "".
 */
public final class Money {

	public static BigDecimal of(Object value) {
		if ((value == null) || "".equals(value) || (value == org.json.JSONObject.NULL)) {
			return BigDecimal.ZERO.setScale(2);
		}

		return new BigDecimal(value.toString()).setScale(2, RoundingMode.HALF_UP);
	}

	public static BigDecimal percentOf(BigDecimal amount, BigDecimal percent) {
		return amount.multiply(percent).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
	}

	public static boolean same(BigDecimal a, Object b) {
		return a.compareTo(of(b)) == 0;
	}

	private Money() {
	}

}
