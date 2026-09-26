package com.maddybaba.actions;

import java.math.BigDecimal;

import org.json.JSONObject;

/**
 * What Liferay posts to an object action: the trigger, the entry ID (classPK) and the entry's raw
 * values (picklists as keys, relationships as r_..._Id numbers), plus the values before the change on
 * updates.
 */
public record ActionPayload(String trigger, long entryId, JSONObject values, JSONObject originalValues) {

	public static ActionPayload of(String json) {
		JSONObject jsonObject = new JSONObject(json);
		JSONObject original = jsonObject.optJSONObject("originalObjectEntry");

		return new ActionPayload(
			jsonObject.getString("objectActionTriggerKey"), jsonObject.getLong("classPK"),
			jsonObject.getJSONObject("objectEntry").getJSONObject("values"),
			(original == null) ? null : original.getJSONObject("values"));
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

}
