/**
 * AES-256-GCM encryption for invitation tokens. The key lives only in this
 * service's environment (INVITATION_TOKEN_SECRET) and is never sent to, or
 * derivable from, the browser bundle.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
	const secret = process.env.INVITATION_TOKEN_SECRET;

	if (!secret) {
		throw new Error(
			'INVITATION_TOKEN_SECRET environment variable is not set'
		);
	}

	const key = Buffer.from(secret, 'base64');

	if (key.length !== 32) {
		throw new Error(
			'INVITATION_TOKEN_SECRET must be a base64 string decoding to 32 bytes (AES-256). Generate one with: openssl rand -base64 32'
		);
	}

	return key;
}

export function encryptInvitationPayload(payload) {
	const key = getKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	const ciphertext = Buffer.concat([
		cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

export function decryptInvitationToken(token) {
	const key = getKey();
	const data = Buffer.from(token, 'base64url');

	const iv = data.subarray(0, IV_LENGTH);
	const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

	decipher.setAuthTag(authTag);

	const plaintext = Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]);

	return JSON.parse(plaintext.toString('utf8'));
}
