// LOCAL INSTANCE ONLY. End-to-end checks through the APIs the website and app use (docs/website.md 7):
// booking → items → pricing → payment → confirmation → commission, the microservice validation rules,
// cross-account permissions, and the trust rule of docs/data-model.md 7.1: forged object action events
// sent straight to mb-actions-service must change nothing.
//
// Needs the seed (seed.js), test users (test-users.js), mb-actions-service and mb-search-service running.
// Creates entries with ERCs MB_E2E_… (upserted, so reruns reuse them); never deletes. The forged events use
// the service's own OAuth2 app (client credentials from Liferay's route files for mb-actions-service; never
// printed), standing in for any token the service accepts.
//
// Usage: node scripts/setup/e2e.js

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const liferay = require('./lib/liferay');

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(liferay.baseURL)) {
	console.error(`e2e.js is for the local instance only; LIFERAY_URL is ${liferay.baseURL}.`);
	process.exit(1);
}

const ACTIONS = 'http://localhost:58081';
const SEARCH = 'http://localhost:58082';
const USERS = '/o/headless-admin-user/v1.0';
const ROUTES = process.env.MB_ROUTES_DIR || 'D:/DXP/liferay-dxp/routes/default/mb-actions-service';

const results = [];

function check(text, ok, detail = '') {
	results.push(ok);
	console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${text}${detail !== '' ? `  (${detail})` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function userAuth(erc, email) {
	const secret = `Mb-${crypto.randomBytes(9).toString('base64url')}7!`;

	await liferay.patch(`${USERS}/user-accounts/by-external-reference-code/${erc}`, {password: secret});

	return 'Basic ' + Buffer.from(`${email}:${secret}`).toString('base64');
}

async function as(auth, method, urlPath, body) {
	const response = await fetch(liferay.baseURL + urlPath, {
		body: body && JSON.stringify(body),
		headers: {Accept: 'application/json', Authorization: auth, 'Content-Type': 'application/json'},
		method,
	});
	const text = await response.text();

	return {body: text ? (() => {
		try {
			return JSON.parse(text);
		}
		catch (error) {
			return text;
		}
	})() : null, status: response.status};
}

async function waitFor(fn, seconds = 60) {
	for (let i = 0; i < seconds; i++) {
		const value = await fn();

		if (value) {
			return value;
		}

		await sleep(1000);
	}

	return null;
}

async function upsert(plural, entry) {
	const existing = await liferay.get(`/o/c/${plural}/by-external-reference-code/${entry.externalReferenceCode}`);

	return existing || liferay.post(`/o/c/${plural}`, entry);
}

const get = (plural, erc) => liferay.get(`/o/c/${plural}/by-external-reference-code/${erc}`);

// A token the service accepts, to send it forged events. Fetched for each event: a test machine that
// sleeps mid-run would otherwise send an expired one.

async function serviceToken() {
	const read = (name) => fs.readFileSync(path.join(ROUTES, `mb-actions-service-oahs.oauth2.${name}`), 'utf8').trim();
	const tokenURI = read('token.uri');
	const response = await fetch(tokenURI.startsWith('/') ? liferay.baseURL + tokenURI : tokenURI, {
		body: new URLSearchParams({client_id: read('headless.server.client.id'), client_secret: read('headless.server.client.secret'), grant_type: 'client_credentials'}),
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		method: 'POST',
	});

	return (await response.json()).access_token;
}

async function forge(resource, trigger, entryId, values, original) {
	const token = await serviceToken();
	const response = await fetch(`${ACTIONS}/object/action/${resource}`, {
		body: JSON.stringify({
			classPK: entryId,
			objectActionTriggerKey: trigger,
			objectEntry: {status: 0, values},
			...(original && {originalObjectEntry: {status: 2, values: original}}),
		}),
		headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
		method: 'POST',
	});

	return response.status;
}

async function main() {
	const traveler = await userAuth('MB_TEST_user_traveler', 'mb.test.traveler@example.com');
	const priya = await userAuth('MB_TEST_user_host2', 'mb.test.host2@example.com');
	const travelerProfile = await get('travelers', 'MB_SEED_traveler_ankit');
	const priyaHost = await get('hosts', 'MB_SEED_host_priya');
	const rahulListing = await get('listings', 'MB_SEED_listing_manaliTrip');
	const dalBaati = await get('listings', 'MB_SEED_listing_dalBaati');
	const priyaAccount = priyaHost.r_accountHosts_accountEntryId;

	// A slot for the e2e bookings, 20 days ahead, with 3 places.

	const slotDate = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);

	// Each run books afresh on its own slot, so the checks of pending and confirmed states hold on reruns.

	const run = Date.now().toString(36);
	const slot = await upsert('availabilityslots', {
		capacity: 3,
		externalReferenceCode: `MB_E2E_slot_dalBaati_${run}`,
		r_accountAvailabilitySlots_accountEntryId: priyaAccount,
		r_listingSlots_c_listingId: dalBaati.id,
		slotDate,
		slotStatus: 'open',
	});

	console.log('Booking flow (as the test traveler):');

	const bookingERC = `MB_E2E_booking_${run}`;
	let booking = await get('bookings', bookingERC);

	if (!booking) {
		const created = await as(traveler, 'POST', '/o/c/bookings', {
			bookingStatus: 'pendingPayment',
			email: 'ankit.sharma@example.com',
			externalReferenceCode: bookingERC,
			leadName: 'Ankit Sharma',
			phone: '+919810000401',
			r_accountBookings_accountEntryId: priyaAccount,
			r_travelerBookings_c_travelerId: travelerProfile.id,
			source: 'web',
			travelDate: slotDate,
			travelerCount: 2,
		});

		check('traveler creates a booking on the host\'s account', created.status === 200, created.status);
		booking = created.body;

		const item = await as(traveler, 'POST', '/o/c/bookingitems', {
			category: 'experiences',
			externalReferenceCode: `MB_E2E_item_${run}`,
			itemTitle: dalBaati.title,
			quantity: 2,
			r_bookingItems_c_bookingId: booking.id,
			r_slotBookingItems_c_availabilitySlotId: slot.id,
			unitPrice: 1500,
		});

		check('traveler adds 2 places on the slot', item.status === 200, item.status);
		await liferay.patch(`/o/c/bookingitems/${item.body.id}`, {r_listingBookingItems_c_listingId: dalBaati.id});
		await liferay.patch(`/o/c/bookings/${booking.id}`, {r_hostBookings_c_hostId: priyaHost.id});
	}

	booking = await waitFor(async () => {
		const current = await get('bookings', bookingERC);

		return Number(current.total) === 3177 ? current : null;
	}) || (await get('bookings', bookingERC));

	check('pricing by the service: ₹3,000 + 5% fee ₹150 + 18% GST on the fee ₹27 = ₹3,177', Number(booking.total) === 3177, booking.total);

	const overbook = await as(traveler, 'POST', '/o/c/bookingitems', {
		category: 'experiences', itemTitle: dalBaati.title, quantity: 2, r_bookingItems_c_bookingId: booking.id, r_slotBookingItems_c_availabilitySlotId: slot.id, unitPrice: 1500,
	});

	check('slot capacity rule: 2 more places on a slot with 1 left is rejected', overbook.status === 400 && JSON.stringify(overbook.body).includes('Not enough spots'), overbook.status);

	const tamper = await as(traveler, 'PATCH', `/o/c/bookings/${booking.id}`, {bookingStatus: 'confirmed', total: 1});

	check('traveler can\'t change their booking (Owner keeps View only)', tamper.status === 403, tamper.status);

	console.log('\nTrust rule: forged events sent straight to mb-actions-service:');

	const pending = await upsert('payments', {
		amount: booking.total, externalReferenceCode: `MB_E2E_payment_initiated_${run}`, gateway: 'razorpay', method: 'upi', paymentStatus: 'initiated', r_bookingPayments_c_bookingId: booking.id,
	});

	const forgedPayment = await forge('payment', 'onAfterUpdate', pending.id, {paymentStatus: 'success', gatewayTxnId: 'pay_FORGED', amount: booking.total, r_bookingPayments_c_bookingId: booking.id}, {paymentStatus: 'initiated'});
	await sleep(3000);
	check('forged "payment success" is accepted (HTTP 200) but doesn\'t confirm the booking', forgedPayment === 200 && (await get('bookings', bookingERC)).bookingStatus.key === 'pendingPayment', `HTTP ${forgedPayment}`);

	const forgedBooking = await forge('booking', 'onAfterUpdate', booking.id, {bookingStatus: 'confirmed'}, {bookingStatus: 'pendingPayment'});
	await sleep(3000);
	check('forged "booking confirmed" is accepted (HTTP 200) but creates no commission', forgedBooking === 200 && !(await liferay.get(`/o/c/commissions/by-external-reference-code/MB_commission_${booking.id}_host`)), `HTTP ${forgedBooking}`);

	const pendingHost = await upsert('hosts', {
		displayName: 'E2E Pending', externalReferenceCode: 'MB_E2E_host_pending', handle: 'e2e-pending', hostOffers: ['guiding'], hostRole: 'experienceHost', phone: '+919800000999', r_destinationHosts_c_destinationId: priyaHost.r_destinationHosts_c_destinationId, termsAccepted: true,
	});

	const forgedHost = await forge('host', 'onAfterUpdate', pendingHost.id, {displayName: 'E2E Pending'}, {displayName: 'E2E Pending'});
	await sleep(3000);

	const afterForge = await get('hosts', 'MB_E2E_host_pending');

	check('forged "host approved" is accepted (HTTP 200) but onboards nothing (no account, still pendingVerification)', forgedHost === 200 && !afterForge.r_accountHosts_accountEntryId && afterForge.hostStatus.key === 'pendingVerification', `HTTP ${forgedHost}, ${afterForge.hostStatus.key}, account ${afterForge.r_accountHosts_accountEntryId || 0}`);

	console.log('\nReal payment:');

	const wrongAmount = await upsert('payments', {
		amount: 1, externalReferenceCode: `MB_E2E_payment_wrong_${run}`, gateway: 'razorpay', gatewayTxnId: `pay_E2E_wrong_${run}`, method: 'upi', paymentStatus: 'success', r_bookingPayments_c_bookingId: booking.id,
	});

	await sleep(4000);
	check(`a success payment of ₹${wrongAmount.amount} (not the total) doesn't confirm the booking`, (await get('bookings', bookingERC)).bookingStatus.key === 'pendingPayment');

	await upsert('payments', {
		amount: booking.total, externalReferenceCode: `MB_E2E_payment_ok_${run}`, gateway: 'razorpay', gatewayTxnId: `pay_E2E_ok_${run}`, method: 'upi', paymentStatus: 'success', paidAt: new Date().toISOString().slice(0, 19) + 'Z', r_bookingPayments_c_bookingId: booking.id,
	});

	const confirmed = await waitFor(async () => ((await get('bookings', bookingERC)).bookingStatus.key === 'confirmed' ? true : null), 30);

	check('the real payment (success, transaction ID, exact total) confirms the booking', Boolean(confirmed));

	const commission = await waitFor(() => liferay.get(`/o/c/commissions/by-external-reference-code/MB_commission_${booking.id}_host`), 30);

	check('host commission created: 10% of the host\'s items (₹3,000) = ₹300, pending', commission && Number(commission.amount) === 300 && commission.commissionStatus.key === 'pending', commission ? `${commission.amount} ${commission.commissionStatus.key}` : 'none');

	console.log('\nRules and permissions (as Priya, a host):');

	const payout = await as(priya, 'POST', '/o/c/payouts', {
		amount: 100000, payoutMethod: 'UPI', payoutStatus: 'requested', r_accountPayouts_accountEntryId: priyaAccount, r_hostPayouts_c_hostId: priyaHost.id, requestedAt: new Date().toISOString().slice(0, 19) + 'Z',
	});

	check('payout above the available balance is rejected', payout.status === 400 && JSON.stringify(payout.body).includes('exceeds available balance'), payout.status);

	const addOn = await as(priya, 'POST', '/o/c/listinginclusions', {
		inclusionType: 'addOn', label: 'E2E add-on without a price', r_accountListingInclusions_accountEntryId: priyaAccount, r_listingInclusions_c_listingId: dalBaati.id,
	});

	check('add-on without a price is rejected', addOn.status === 400 && JSON.stringify(addOn.body).includes('Add-ons need a price'), addOn.status);

	const foreign = await as(priya, 'PATCH', `/o/c/listings/${rahulListing.id}`, {basePrice: 1});

	check('Priya can\'t change Rahul\'s listing', [403, 404].includes(foreign.status), foreign.status);

	const ownHost = await as(priya, 'PATCH', `/o/c/hosts/${priyaHost.id}`, {commissionRate: 50});

	check('Priya can\'t change her own Host record (commission, status)', [403, 404].includes(ownHost.status), ownHost.status);

	console.log('\nSearch:');

	const hosts = await (await fetch(`${SEARCH}/search/hosts?q=goa`)).json();

	check('the host who signed up on the website (Deepa, Goa) is live in search', hosts.items.some((item) => item.handle === 'deepa-goa'), hosts.items.map((item) => item.handle).join(','));
	check('the pending e2e host is not', !(await (await fetch(`${SEARCH}/search/hosts/e2e-pending`)).ok));

	console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed. Test user passwords were reset: run test-users.js to get new ones.`);
	process.exitCode = results.every(Boolean) ? 0 : 1;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
