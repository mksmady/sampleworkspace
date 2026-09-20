package com.sampleworkspace.invitation.internal.action.executor;

import com.liferay.object.action.executor.BaseObjectActionExecutor;
import com.liferay.object.action.executor.ObjectActionExecutor;
import com.liferay.object.model.ObjectEntry;
import com.liferay.object.service.ObjectEntryLocalService;
import com.liferay.portal.kernel.json.JSONFactoryUtil;
import com.liferay.portal.kernel.json.JSONObject;
import com.liferay.portal.kernel.log.Log;
import com.liferay.portal.kernel.log.LogFactoryUtil;
import com.liferay.portal.kernel.service.ServiceContext;
import com.liferay.portal.kernel.util.GetterUtil;
import com.liferay.portal.kernel.util.PropsUtil;
import com.liferay.portal.kernel.util.UnicodeProperties;

import java.io.Serializable;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

/**
 * Runs in-process on the InvitationDetails object's onAfterAdd trigger,
 * replacing the earlier "function#" executor that called out to a separate
 * Node service over HTTP + OAuth2 JWT. Generates the invitation token and
 * link directly and writes them back onto the same entry.
 */
@Component(service = ObjectActionExecutor.class)
public class InvitationTokenObjectActionExecutor
	extends BaseObjectActionExecutor {

	public static final String KEY = "invitation-token-object-action";

	@Override
	public String getKey() {
		return KEY;
	}

	@Override
	protected void doExecute(
			long companyId, long objectActionId,
			UnicodeProperties parametersUnicodeProperties,
			JSONObject payloadJSONObject, long userId)
		throws Exception {

		long objectEntryId = _getObjectEntryId(payloadJSONObject);

		if (objectEntryId == 0) {
			_log.error(
				"Unable to determine object entry ID from payload " +
					payloadJSONObject.toString());

			return;
		}

		ObjectEntry objectEntry = _objectEntryLocalService.getObjectEntry(
			objectEntryId);

		Map<String, Serializable> values = _objectEntryLocalService.getValues(
			objectEntry);

		String emailId = GetterUtil.getString(values.get("emailId"));
		String companyName = GetterUtil.getString(values.get("companyName"));
		String expiryDate = GetterUtil.getString(values.get("expiryDate"));
		String accountManagerName = GetterUtil.getString(
			values.get("accountManagerName"));

		String token = _generateToken(
			emailId, companyName, expiryDate, accountManagerName);

		String acceptBaseURL = GetterUtil.getString(
			PropsUtil.get("invitation.accept.base.url"),
			"http://localhost:8080/web/guest/accept-invite");

		values.put("token", token);
		values.put("invitationLink", acceptBaseURL + "?token=" + token);

		ServiceContext serviceContext = new ServiceContext();

		serviceContext.setCompanyId(companyId);

		_objectEntryLocalService.partialUpdateObjectEntry(
			userId, objectEntryId, objectEntry.getObjectEntryFolderId(),
			values, serviceContext);
	}

	private String _generateToken(
			String emailId, String companyName, String expiryDate,
			String accountManagerName)
		throws Exception {

		JSONObject tokenPayloadJSONObject =
			JSONFactoryUtil.createJSONObject();

		tokenPayloadJSONObject.put(
			"accountManagerName", accountManagerName
		).put(
			"companyName", companyName
		).put(
			"emailId", emailId
		).put(
			"expiryDate", expiryDate
		).put(
			"issuedAt", Instant.now().toString()
		);

		byte[] key = MessageDigest.getInstance("SHA-256").digest(
			GetterUtil.getString(
				PropsUtil.get("invitation.token.secret"),
				"sample-workspace-invitation-token-secret"
			).getBytes(StandardCharsets.UTF_8));

		byte[] iv = new byte[12];

		_secureRandom.nextBytes(iv);

		Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");

		cipher.init(
			Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"),
			new GCMParameterSpec(128, iv));

		byte[] cipherBytes = cipher.doFinal(
			tokenPayloadJSONObject.toString().getBytes(
				StandardCharsets.UTF_8));

		byte[] tokenBytes = new byte[iv.length + cipherBytes.length];

		System.arraycopy(iv, 0, tokenBytes, 0, iv.length);
		System.arraycopy(
			cipherBytes, 0, tokenBytes, iv.length, cipherBytes.length);

		return Base64.getUrlEncoder().withoutPadding().encodeToString(
			tokenBytes);
	}

	private long _getObjectEntryId(JSONObject payloadJSONObject) {
		Object objectEntryObject = payloadJSONObject.get("objectEntry");

		if (!(objectEntryObject instanceof Map)) {
			return 0;
		}

		Map<?, ?> objectEntryMap = (Map<?, ?>)objectEntryObject;

		long objectEntryId = GetterUtil.getLong(objectEntryMap.get("id"));

		if (objectEntryId == 0) {
			objectEntryId = GetterUtil.getLong(
				objectEntryMap.get("objectEntryId"));
		}

		return objectEntryId;
	}

	private static final Log _log = LogFactoryUtil.getLog(
		InvitationTokenObjectActionExecutor.class);

	private final SecureRandom _secureRandom = new SecureRandom();

	@Reference
	private ObjectEntryLocalService _objectEntryLocalService;

}
