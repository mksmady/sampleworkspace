package com.maddybaba.actions;

import java.math.BigDecimal;
import java.util.Objects;

import org.json.JSONObject;

/**
 * Helpers for comparing and patching headless entries: only fields whose stored value differs are
 * written, so a handler's own update ends the chain it starts (docs/search.md section 3).
 */
public final class Values {

	/**
	 * The fields of wanted whose value differs from the stored entry's.
	 */
	public static JSONObject diff(JSONObject wanted, JSONObject stored) {
		JSONObject patch = new JSONObject();

		for (String name : wanted.keySet()) {
			if (!same(wanted.opt(name), stored.opt(name))) {
				patch.put(name, wanted.get(name));
			}
		}

		return patch;
	}

	public static boolean isApproved(JSONObject entry) {
		JSONObject status = entry.optJSONObject("status");

		return (status != null) && (status.optInt("code", -1) == 0);
	}

	public static String key(Object picklistValue) {
		if (picklistValue instanceof JSONObject jsonObject) {
			return jsonObject.optString("key");
		}

		return ((picklistValue == null) || (picklistValue == JSONObject.NULL)) ? "" : picklistValue.toString();
	}

	/**
	 * Compares a wanted value with the stored one: numbers by value, dates by day, empty and null alike.
	 */
	public static boolean same(Object wanted, Object stored) {
		boolean wantedEmpty = (wanted == null) || (wanted == JSONObject.NULL) || "".equals(wanted);
		boolean storedEmpty = (stored == null) || (stored == JSONObject.NULL) || "".equals(stored);

		if (wantedEmpty || storedEmpty) {
			return wantedEmpty && storedEmpty;
		}

		if ((wanted instanceof Number) || (stored instanceof Number)) {
			try {
				return new BigDecimal(wanted.toString()).compareTo(new BigDecimal(stored.toString())) == 0;
			}
			catch (NumberFormatException numberFormatException) {
				return false;
			}
		}

		String a = wanted.toString();
		String b = stored.toString();

		if (a.matches("\\d{4}-\\d{2}-\\d{2}")) {
			return b.startsWith(a);
		}

		return Objects.equals(a, b);
	}

	private Values() {
	}

}
