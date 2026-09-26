package com.maddybaba.actions;

import java.math.BigDecimal;

import org.json.JSONObject;

/**
 * What Liferay posts to an object action: the trigger, the entry ID (classPK), the entry's raw values
 * (picklists as keys, relationships as r_..._Id numbers) and workflow status (0 = approved), plus the
 * values and status before the change on updates.
 */
public record ActionPayload(
	String trigger, long entryId, JSONObject values, int status, JSONObject originalValues, int originalStatus) {

	public static ActionPayload of(String json) {
		JSONObject jsonObject = new JSONObject(json);
		JSONObject entry = jsonObject.getJSONObject("objectEntry");
		JSONObject original = jsonObject.optJSONObject("originalObjectEntry");

		return new ActionPayload(
			jsonObject.getString("objectActionTriggerKey"), jsonObject.getLong("classPK"), entry.getJSONObject("values"),
			entry.optInt("status", -1), (original == null) ? null : original.getJSONObject("values"),
			(original == null) ? -1 : original.optInt("status", -1));
	}

	/**
	 * True when this update is the one that approved the entry (workflow status became approved).
	 */
	public boolean justApproved() {
		return (status == 0) && (originalValues != null) && (originalStatus != 0);
	}

	public BigDecimal decimal(String name) {
		return Money.of(values.opt(name));
	}

	/**
	 * A relationship value (r_..._Id), or 0 when not set.
	 */
	public long id(String name) {
		return values.optLong(name, 0);
	}

	public long originalId(String name) {
		return (originalValues == null) ? 0 : originalValues.optLong(name, 0);
	}

	/**
	 * A picklist value (its key), or "" when not set.
	 */
	public String key(String name) {
		return values.optString(name, "");
	}

	public String originalKey(String name) {
		return (originalValues == null) ? "" : originalValues.optString(name, "");
	}

}
