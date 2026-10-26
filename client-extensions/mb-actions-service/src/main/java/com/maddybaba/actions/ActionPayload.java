package com.maddybaba.actions;

import java.math.BigDecimal;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * An object action event: the trigger, the entry ID (classPK), the entry's values (picklists as keys,
 * relationships as r_..._Id numbers) and workflow status (0 = approved), plus the values and status before
 * the change on updates.
 *
 * Trust rule (docs/data-model.md 7.1): the webhook's JWT comes from the user-agent OAuth2 app, which any
 * signed-in user can get a token for, so the posted body may be forged. For add and update events the
 * values and status are therefore re-read from Liferay with the service's own identity; only the entry ID,
 * the trigger and the original values come from the request. Handlers act on the stored values and use
 * the original values only to skip work, so a forged event can do no more than a real one for the entry's
 * current state. Delete events can't be re-read (the entry is gone); their handlers only recalculate
 * related entries from stored data.
 */
public record ActionPayload(
	String trigger, long entryId, JSONObject values, int status, JSONObject originalValues, int originalStatus) {

	/**
	 * The event for an entry of /o/c/{plural}, with its stored values, or null when the entry of an add or
	 * update event doesn't exist (nothing to do).
	 */
	public static ActionPayload trusted(String json, LiferayClient liferayClient, String plural) {
		JSONObject jsonObject = new JSONObject(json);
		JSONObject entry = jsonObject.getJSONObject("objectEntry");
		JSONObject original = jsonObject.optJSONObject("originalObjectEntry");

		String trigger = jsonObject.getString("objectActionTriggerKey");
		long entryId = jsonObject.getLong("classPK");
		JSONObject values = entry.getJSONObject("values");
		int status = entry.optInt("status", -1);

		if (!"onAfterDelete".equals(trigger)) {
			JSONObject stored = liferayClient.getOrNull("/o/c/" + plural + "/" + entryId);

			if (stored == null) {
				return null;
			}

			values = _values(stored);
			status = stored.optJSONObject("status").optInt("code", -1);
		}

		return new ActionPayload(
			trigger, entryId, values, status, (original == null) ? null : original.getJSONObject("values"),
			(original == null) ? -1 : original.optInt("status", -1));
	}

	public boolean approved() {
		return status == 0;
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

	/**
	 * True when this update is the one that approved the entry: it is approved now (stored status) and
	 * wasn't before.
	 */
	public boolean justApproved() {
		return approved() && (originalValues != null) && (originalStatus != 0);
	}

	/**
	 * A picklist value (its key), or "" when not set.
	 */
	public String key(String name) {
		return values.optString(name, "");
	}

	public long originalId(String name) {
		return (originalValues == null) ? 0 : originalValues.optLong(name, 0);
	}

	public String originalKey(String name) {
		return (originalValues == null) ? "" : originalValues.optString(name, "");
	}

	public String originalString(String name) {
		return (originalValues == null) ? "" : originalValues.optString(name, "");
	}

	/**
	 * Converts a headless entry to the webhook's value format: picklists ({key, name}) and multiselect
	 * picklists become their keys.
	 */
	private static JSONObject _values(JSONObject stored) {
		JSONObject values = new JSONObject();

		for (String name : stored.keySet()) {
			Object value = stored.get(name);

			if ((value instanceof JSONObject jsonObject) && jsonObject.has("key")) {
				value = jsonObject.getString("key");
			}
			else if ((value instanceof JSONArray jsonArray) && !jsonArray.isEmpty() &&
					 (jsonArray.opt(0) instanceof JSONObject first) && first.has("key")) {

				JSONArray keys = new JSONArray();

				for (int i = 0; i < jsonArray.length(); i++) {
					keys.put(jsonArray.getJSONObject(i).optString("key"));
				}

				value = keys;
			}

			values.put(name, value);
		}

		return values;
	}

}
