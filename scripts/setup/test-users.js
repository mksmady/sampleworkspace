// LOCAL INSTANCE ONLY. Creates the non-admin test users (and their host accounts) used to test
// permissions: a traveler, two hosts in separate accounts, and an ops admin.
// Idempotent: users and accounts are looked up by ERC; memberships and roles are only added if missing.
// Every run sets a fresh random password on each user and prints it to the terminal only. Passwords
// are never written to files. Then it logs in as each user to prove the credentials work.
//
// Usage: node scripts/setup/test-users.js

const crypto = require('crypto');

const liferay = require('./lib/liferay');

const API = '/o/headless-admin-user/v1.0';

const ACCOUNTS = [
	{erc: 'MB_TEST_account_host1', name: 'MB Test Host Account 1'},
	{erc: 'MB_TEST_account_host2', name: 'MB Test Host Account 2'},
];

const USERS = [
	{email: 'mb.test.traveler@example.com', erc: 'MB_TEST_user_traveler', familyName: 'Traveler', roles: ['MB_Traveler']},
	{account: 'MB_TEST_account_host1', accountRoles: ['MB_Host'], email: 'mb.test.host1@example.com', erc: 'MB_TEST_user_host1', familyName: 'Host One'},
	{account: 'MB_TEST_account_host2', accountRoles: ['MB_Host'], email: 'mb.test.host2@example.com', erc: 'MB_TEST_user_host2', familyName: 'Host Two'},
	{email: 'mb.test.ops@example.com', erc: 'MB_TEST_user_ops', familyName: 'Ops', roles: ['MB_OpsAdmin']},
];

const password = () => `Mb-${crypto.randomBytes(9).toString('base64url')}7!`;

async function syncAccount(account) {
	if (await liferay.get(`${API}/accounts/by-external-reference-code/${account.erc}`)) {
		return 'unchanged';
	}

	await liferay.post(`${API}/accounts`, {externalReferenceCode: account.erc, name: account.name, type: 'business'});

	return 'created';
}

async function syncUser(user, newPassword) {
	const path = `${API}/user-accounts/by-external-reference-code/${user.erc}`;
	let existing = await liferay.get(path);

	if (existing) {
		await liferay.patch(path, {password: newPassword});
	}
	else {
		existing = await liferay.post(`${API}/user-accounts`, {
			alternateName: user.erc.replace('MB_TEST_user_', 'mb-test-'),
			emailAddress: user.email,
			externalReferenceCode: user.erc,
			familyName: user.familyName,
			givenName: 'MB Test',
			password: newPassword,
		});
	}

	// Users who haven't finished first login are treated as guests, so none of their roles apply.
	// Email verification is disabled in Instance Settings (see docs/data-model.md section 6); the
	// other first-login steps (terms of use, reminder question) are completed here.

	await liferay.jsonws('user/update-agreed-to-terms-of-use', {agreedToTermsOfUse: true, userId: existing.id});
	await liferay.jsonws('user/update-reminder-query', {answer: crypto.randomBytes(9).toString('hex'), question: 'what-is-your-library-card-number', userId: existing.id});

	const current = await liferay.get(path);
	const roleERCs = new Set((current.roleBriefs || []).map((role) => role.externalReferenceCode));

	for (const roleERC of user.roles || []) {
		if (!roleERCs.has(roleERC)) {
			await liferay.post(`${API}/roles/by-external-reference-code/${roleERC}/association/user-account/${current.id}`);
		}
	}

	if (user.account) {
		const accountPath = `${API}/accounts/by-external-reference-code/${user.account}`;

		if (!(current.accountBriefs || []).some((account) => account.externalReferenceCode === user.account)) {
			await liferay.post(`${accountPath}/user-accounts/by-email-address/${user.email}`);
		}

		const assigned = await liferay.get(`${accountPath}/user-accounts/by-external-reference-code/${user.erc}/account-roles`);
		const assignedERCs = new Set((assigned?.items || []).map((role) => role.externalReferenceCode));

		for (const roleERC of user.accountRoles || []) {
			if (!assignedERCs.has(roleERC)) {
				await liferay.post(`${accountPath}/account-roles/by-external-reference-code/${roleERC}/user-accounts/by-email-address/${user.email}`);
			}
		}
	}

	return existing.id;
}

// A signed-in user can always read their own account. A 403 here means Liferay treated the request as
// a guest's (see the terms-of-use note above); 401 means wrong credentials.

async function login(email, secret) {
	const response = await fetch(`${liferay.baseURL}${API}/my-user-account`, {
		headers: {Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${email}:${secret}`).toString('base64')},
	});

	return response.status;
}

async function main() {
	for (const account of ACCOUNTS) {
		console.log(`  ${(await syncAccount(account)).padEnd(9)} account ${account.erc}`);
	}

	const credentials = [];

	for (const user of USERS) {
		const secret = password();

		await syncUser(user, secret);
		credentials.push({email: user.email, secret, status: await login(user.email, secret), user});
	}

	console.log('\nTest users (local instance only; passwords change on every run):');

	for (const {email, secret, status, user} of credentials) {
		const roles = [...(user.roles || []), ...(user.accountRoles || []).map((role) => `${role} in ${user.account}`)].join(', ');

		console.log(`  ${email.padEnd(30)} ${secret.padEnd(20)} login=${status === 200 ? 'OK' : `FAILED (${status})`}  ${roles}`);
	}

	process.exitCode = credentials.every((credential) => credential.status === 200) ? 0 : 1;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
