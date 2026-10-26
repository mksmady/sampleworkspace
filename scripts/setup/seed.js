// LOCAL INSTANCE ONLY. Loads the seed data in data/seed/ (docs/data-model.md section 9) through the real
// flows, then verifies the result with GETs, also as each test user:
// - Hosts and Listings go through MB Ops Approval, approved by the ops test user; mb-actions-service then
//   onboards the hosts (hostStatus active, account, roles).
// - The traveler creates their own profile, package, booking and item; a successful payment arrives and
//   mb-actions-service must confirm the booking and create the host's commission.
// - Derived fields (denormalized, ratings, prices from, host counts, fees, totals) are left to
//   mb-actions-service, which must be running; verify waits for them.
// Idempotent: entries are looked up by ERC (MB_SEED_...), created when missing and patched only where
// they differ, so a rerun changes nothing (except adding availability slots for new days). Nothing is
// ever deleted. Needs the test users from test-users.js.
//
// Usage: node scripts/setup/seed.js [--verify-only]

const crypto = require('crypto');

const liferay = require('./lib/liferay');
const seed = require('./data/seed/seed.json');

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(liferay.baseURL)) {
	console.error(`Seed data is for the local instance only; LIFERAY_URL is ${liferay.baseURL}.`);
	process.exit(1);
}

const ACTIONS_SERVICE = 'http://localhost:58081/ready';
const USERS = '/o/headless-admin-user/v1.0';
const WORKFLOW = '/o/headless-admin-workflow/v1.0';

// Travelers can't see Hosts or Listings (docs/data-model.md 6.2), so relationships to them are added by
// the admin after the traveler creates the entry.

const TRAVELER_CANNOT_REFERENCE = /^r_(hostPackages|hostBookings|listingBookingItems)_/;

const counts = {};

// ---- Users acting on the instance -------------------------------------------------------------------

async function userAuth(erc, email) {
	const secret = `Mb-${crypto.randomBytes(9).toString('base64url')}7!`;

	await liferay.patch(`${USERS}/user-accounts/by-external-reference-code/${erc}`, {password: secret});

	return 'Basic ' + Buffer.from(`${email}:${secret}`).toString('base64');
}

async function as(auth, method, path, body) {
	const response = await fetch(liferay.baseURL + path, {
		body: body && JSON.stringify(body),
		headers: {Accept: 'application/json', ...(auth && {Authorization: auth}), 'Content-Type': 'application/json'},
		method,
	});
	const text = await response.text();

	if (!response.ok) {
		throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
	}

	return text ? JSON.parse(text) : null;
}

// ---- Comparing seed values with live entries --------------------------------------------------------

function normalize(value) {
	if (Array.isArray(value)) {
		return value.map((item) => (item && typeof item === 'object' ? item.key : item)).sort().join(',');
	}

	if (value && typeof value === 'object') {
		return value.key ?? JSON.stringify(value);
	}

	return value;
}

function same(expected, actual) {
	const a = normalize(actual);
	const e = normalize(expected);

	if (e === null) {
		return a === null || a === undefined || a === '';
	}

	if (typeof e === 'number') {
		return a !== null && a !== undefined && a !== '' && Number(a) === e;
	}

	if (typeof e === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(e)) {
		return Date.parse(a) === Date.parse(e);
	}

	if (typeof e === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e)) {
		return typeof a === 'string' && a.startsWith(e);
	}

	return String(a ?? '') === String(e ?? '');
}

const differences = (entry, actual) =>
	Object.fromEntries(Object.entries(entry).filter(([key, value]) => key !== 'externalReferenceCode' && !same(value, actual[key])));

const get = (plural, erc) => liferay.get(`/o/c/${plural}/by-external-reference-code/${erc}`);

// Polls until check(entry) holds: mb-actions-service works asynchronously after each save.

async function waitFor(plural, erc, check, what, seconds = 60) {
	let entry;

	for (let attempt = 0; attempt < seconds; attempt++) {
		entry = await get(plural, erc);

		if (entry && check(entry)) {
			return entry;
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error(`Timed out waiting for ${what} (${erc}). Is mb-actions-service running?`);
}

// ---- Upsert ------------------------------------------------------------------------------------------

async function upsert(plural, entry, {creator} = {}) {
	const path = `/o/c/${plural}/by-external-reference-code/${entry.externalReferenceCode}`;
	let actual = await liferay.get(path);
	let result = 'unchanged';

	if (!actual) {
		const body = creator
			? Object.fromEntries(Object.entries(entry).filter(([key]) => !TRAVELER_CANNOT_REFERENCE.test(key)))
			: entry;

		actual = creator ? await as(creator, 'POST', `/o/c/${plural}`, body) : await liferay.post(`/o/c/${plural}`, body);
		result = 'created';
	}

	const patch = differences(entry, actual);

	if (Object.keys(patch).length) {
		await liferay.patch(`/o/c/${plural}/${actual.id}`, patch);
		result = result === 'created' ? 'created' : 'updated';
	}

	counts[plural] = counts[plural] || {created: 0, unchanged: 0, updated: 0};
	counts[plural][result]++;

	return liferay.get(path);
}

// ---- Seed values -------------------------------------------------------------------------------------

const isoDate = (date) => date.toISOString().slice(0, 10);

function slotDates(listingKey) {
	const dates = new Set();
	const tomorrow = new Date();

	tomorrow.setUTCHours(0, 0, 0, 0);

	for (let day = 1; day <= seed.slotDays; day++) {
		dates.add(isoDate(new Date(tomorrow.getTime() + day * 86400000)));
	}

	// Slots referenced by the seed booking must exist whenever the seed runs.

	for (const item of seed.bookingItems) {
		if (item.slot?.listing === listingKey) {
			dates.add(item.slot.date);
		}
	}

	return [...dates].sort();
}

const slotERC = (listingKey, date) => `MB_SEED_slot_${listingKey}_${date}`;

function listingEntry({entry}) {
	const {account, destination, host, partner, ...fields} = entry;

	return {
		...fields,
		r_accountListings_accountEntryERC: account,
		r_destinationListings_c_destinationERC: destination,
		r_hostListings_c_hostERC: host,
		...(partner && {r_partnerListings_c_partnerERC: partner}),
	};
}

const inclusionEntry = ({account, listing, ...entry}) => ({
	...entry,
	r_accountListingInclusions_accountEntryERC: account,
	r_listingInclusions_c_listingERC: listing,
});

const itemEntry = ({as: ignored, slot, ...item}) => ({
	...item,
	...(slot && {r_slotBookingItems_c_availabilitySlotERC: slotERC(slot.listing, slot.date)}),
});

const withoutAs = ({as: ignored, ...entry}) => entry;

// ---- Workflow ----------------------------------------------------------------------------------------

async function approvePending(opsAuth, plural, entries) {
	for (const entry of entries) {
		const current = await get(plural, entry.externalReferenceCode);

		if (current.status?.label !== 'pending') {
			continue;
		}

		let task;

		for (let attempt = 0; attempt < 15 && !task; attempt++) {
			if (attempt) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			const tasks = await as(opsAuth, 'GET', `${WORKFLOW}/workflow-tasks/assigned-to-my-roles?pageSize=200`);

			task = tasks.items.find((item) => String(item.objectReviewed?.id) === String(current.id));
		}

		if (!task) {
			throw new Error(`No review task for ${entry.externalReferenceCode}`);
		}

		await as(opsAuth, 'POST', `${WORKFLOW}/workflow-tasks/${task.id}/assign-to-me`, {});
		await as(opsAuth, 'POST', `${WORKFLOW}/workflow-tasks/${task.id}/change-transition`, {transitionName: 'approve'});
		console.log(`  approved  ${entry.externalReferenceCode}`);
	}
}

// ---- Load --------------------------------------------------------------------------------------------

async function load() {
	for (const number of [1, 2, 3, 4]) {
		if (!(await liferay.get(`${USERS}/accounts/by-external-reference-code/MB_TEST_account_host${number}`))) {
			throw new Error(`Account MB_TEST_account_host${number} is missing: run test-users.js first.`);
		}
	}

	if ((await fetch(ACTIONS_SERVICE).catch(() => ({ok: false}))).ok !== true) {
		throw new Error(`mb-actions-service is not running (${ACTIONS_SERVICE}); see its README.`);
	}

	const travelerAuth = await userAuth('MB_TEST_user_traveler', 'mb.test.traveler@example.com');
	const opsAuth = await userAuth('MB_TEST_user_ops', 'mb.test.ops@example.com');

	for (const entry of seed.destinations) {
		await upsert('destinations', entry);
	}

	for (const entry of seed.partners) {
		await upsert('partners', entry);
	}

	for (const entry of seed.hosts) {
		await upsert('hosts', entry);
	}

	await approvePending(opsAuth, 'hosts', seed.hosts);

	for (const entry of seed.hosts) {
		await waitFor('hosts', entry.externalReferenceCode, (host) => host.hostStatus?.key === 'active' && host.status?.label === 'approved', 'host onboarding');
	}

	for (const entry of seed.hostPartnerships) {
		await upsert('hostpartnerships', entry);
	}

	const listings = seed.listings.map(listingEntry);

	for (const entry of listings) {
		await upsert('listings', entry);
	}

	for (const entry of seed.listingInclusions) {
		await upsert('listinginclusions', inclusionEntry(entry));
	}

	for (const {entry, key, slots} of seed.listings) {
		for (const date of slotDates(key)) {
			await upsert('availabilityslots', {
				capacity: slots.capacity,
				externalReferenceCode: slotERC(key, date),
				r_accountAvailabilitySlots_accountEntryERC: entry.account,
				r_listingSlots_c_listingERC: entry.externalReferenceCode,
				slotDate: date,
				slotStatus: 'open',
				...(slots.startTime && {startTime: slots.startTime}),
			});
		}
	}

	// Slots and inclusions don't go through review, but editing a listing does: approve last.

	await approvePending(opsAuth, 'listings', listings);

	await upsert('travelers', withoutAs(seed.traveler), {creator: travelerAuth});
	await upsert('trippackages', withoutAs(seed.tripPackage), {creator: travelerAuth});
	await upsert('bookings', seed.booking.entry, {creator: travelerAuth});

	for (const item of seed.bookingItems) {
		await upsert('bookingitems', itemEntry(item), {creator: travelerAuth});
	}

	const {expected} = seed.booking;

	await waitFor('bookings', seed.booking.entry.externalReferenceCode, (booking) => same(expected.total, booking.total), `booking total ${expected.total}`);

	for (const entry of seed.payments) {
		await upsert('payments', entry);
	}

	await waitFor('bookings', seed.booking.entry.externalReferenceCode, (booking) => booking.bookingStatus?.key === 'confirmed', 'booking confirmed by the payment');

	for (const entry of seed.reviews) {
		await upsert('reviews', entry);
	}

	console.log('\nLoad:');

	for (const [plural, {created, unchanged, updated}] of Object.entries(counts)) {
		console.log(`  ${plural.padEnd(18)} created=${created} updated=${updated} unchanged=${unchanged}`);
	}
}

// ---- Verify ------------------------------------------------------------------------------------------

async function verify() {
	const results = [];
	const check = (text, ok, detail = '') => {
		results.push(ok);
		console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${text}${detail !== '' ? `  (${detail})` : ''}`);
	};

	console.log('\nVerification (GET by ERC):');

	const expected = [
		['destinations', seed.destinations],
		['partners', seed.partners],
		['hosts', seed.hosts],
		['hostpartnerships', seed.hostPartnerships],
		['listings', seed.listings.map(listingEntry)],
		['listinginclusions', seed.listingInclusions.map(inclusionEntry)],
		['travelers', [withoutAs(seed.traveler)]],
		['trippackages', [withoutAs(seed.tripPackage)]],
		['bookings', [seed.booking.entry]],
		['bookingitems', seed.bookingItems.map(itemEntry)],
		['payments', seed.payments],
		['reviews', seed.reviews],
	];

	for (const [plural, entries] of expected) {
		const issues = [];

		for (const entry of entries) {
			const actual = await get(plural, entry.externalReferenceCode);

			if (!actual) {
				issues.push(`${entry.externalReferenceCode} missing`);
				continue;
			}

			const diff = Object.keys(differences(entry, actual));

			if (diff.length) {
				issues.push(`${entry.externalReferenceCode}: ${diff.join(', ')}`);
			}
		}

		check(`${plural}: ${entries.length} match the seed data`, !issues.length, issues.join('; '));
	}

	const slotsExpected = seed.listings.reduce((total, {key}) => total + slotDates(key).length, 0);
	let slotsFound = 0;

	for (const {key} of seed.listings) {
		for (const date of slotDates(key)) {
			slotsFound += (await get('availabilityslots', slotERC(key, date))) ? 1 : 0;
		}
	}

	check('availability slots for the next days exist', slotsFound === slotsExpected, `${slotsFound}/${slotsExpected}`);

	for (const [plural, entries] of [['hosts', seed.hosts], ['listings', seed.listings.map(({entry}) => entry)]]) {
		const statuses = [];

		for (const entry of entries) {
			statuses.push((await get(plural, entry.externalReferenceCode)).status?.label);
		}

		check(`${plural} are approved`, statuses.every((status) => status === 'approved'), statuses.join(','));
	}

	console.log('\nDerived by mb-actions-service:');

	// Derived values may still be settling after a load: each check waits up to 60 s.

	const settled = async (plural, erc, wanted) => {
		const matches = (entry) => Object.entries(wanted).every(([name, value]) => same(value, entry[name]));

		try {
			return await waitFor(plural, erc, matches, 'derived values');
		}
		catch {
			const entry = await get(plural, erc);

			return {mismatch: Object.keys(wanted).filter((name) => !same(wanted[name], entry?.[name])).map((name) => `${name}=${JSON.stringify(entry?.[name])}`)};
		}
	};

	for (const [erc, wanted] of Object.entries(seed.expected.hosts)) {
		const host = await settled('hosts', erc, {...wanted, hostStatus: 'active'});

		check(`${erc}: card fields ${JSON.stringify(wanted)}`, !host.mismatch, host.mismatch?.join(', ') ?? '');

		if (!host.mismatch) {
			const account = await liferay.get(`${USERS}/accounts/${host.r_accountHosts_accountEntryId}`);

			check(`${erc}: linked to its host account`, account?.externalReferenceCode === seed.hosts.find((entry) => entry.externalReferenceCode === erc).r_accountHosts_accountEntryERC, account?.externalReferenceCode);
		}
	}

	for (const [erc, hostCount] of Object.entries(seed.expected.hostCounts)) {
		const destination = await settled('destinations', erc, {hostCount});

		check(`${erc}: hostCount ${hostCount}`, !destination.mismatch, destination.mismatch?.join(', ') ?? '');
	}

	const listing = await settled('listings', 'MB_SEED_listing_manaliTrip', {destinationName: 'Manali', hostDisplayName: 'Rahul', ratingValue: 5, reviewCount: 1, stateName: 'Himachal Pradesh'});

	check('Manali trip listing: destination, host and rating copied', !listing.mismatch, listing.mismatch?.join(', ') ?? '');
	check('Manali trip listing: nextAvailableDate set', !listing.mismatch && Boolean(listing.nextAvailableDate), listing.nextAvailableDate);

	const review = await settled('reviews', 'MB_SEED_review_rahul_ankit', {destinationName: 'Manali', hostDisplayName: 'Rahul'});

	check('Testimonial: hostDisplayName and destinationName copied', !review.mismatch, review.mismatch?.join(', ') ?? '');

	const {expected: money} = seed.booking;
	const booking = await get('bookings', seed.booking.entry.externalReferenceCode);

	check('Booking confirmed by the payment, with a booking number', booking.bookingStatus?.key === 'confirmed' && /^MB-\d+$/.test(booking.bookingNumber), `${booking.bookingStatus?.key} ${booking.bookingNumber}`);
	check(`Booking subtotal ${money.subtotal} + fee ${money.serviceFee} + GST ${money.taxes} = ${money.total}`, same(money.subtotal, booking.subtotal) && same(money.serviceFee, booking.serviceFee) && same(money.taxes, booking.taxes) && same(money.total, booking.total), `${booking.subtotal} + ${booking.serviceFee} + ${booking.taxes} = ${booking.total}`);

	const commission = await settled('commissions', `MB_commission_${booking.id}_host`, {amount: money.commission, availableOn: money.availableOn, commissionStatus: 'pending'});

	check(`Commission created: ${money.commission}, pending, available ${money.availableOn}`, !commission.mismatch, commission.mismatch?.join(', ') ?? '');

	const item = await get('bookingitems', 'MB_SEED_item_manaliTrip');
	const slot = await get('availabilityslots', slotERC('manaliTrip', '2026-11-20'));

	check('Booking item lineTotal 17998; slot bookedCount 2', same(17998, item.lineTotal) && Number(slot.bookedCount) === 2, `${item.lineTotal} / ${slot.bookedCount}`);

	console.log('\nAs the test users:');

	const hostAuths = [];

	for (const number of [1, 2]) {
		hostAuths.push(await userAuth(`MB_TEST_user_host${number}`, `mb.test.host${number}@example.com`));
	}

	const travelerAuth = await userAuth('MB_TEST_user_traveler', 'mb.test.traveler@example.com');
	const seeded = async (auth, plural) =>
		(await as(auth, 'GET', `/o/c/${plural}?pageSize=200`)).items.filter((entry) => /^MB_(SEED_|commission_)/.test(entry.externalReferenceCode)).length;

	const host1 = [await seeded(hostAuths[0], 'listings'), await seeded(hostAuths[0], 'bookings'), await seeded(hostAuths[0], 'commissions')];
	const host2 = [await seeded(hostAuths[1], 'listings'), await seeded(hostAuths[1], 'bookings'), await seeded(hostAuths[1], 'commissions')];

	check('Rahul (host1) sees his 3 listings, 1 booking, 1 commission', host1.join() === '3,1,1', host1.join(' / '));
	check('Priya (host2) sees her 3 listings and no bookings or commissions', host2.join() === '3,0,0', host2.join(' / '));
	check('Rahul (host1) sees Destinations and Reviews (Traveler role)', (await seeded(hostAuths[0], 'destinations')) === 6 && (await seeded(hostAuths[0], 'reviews')) === seed.reviews.length);

	const traveler = [await seeded(travelerAuth, 'bookings'), await seeded(travelerAuth, 'trippackages'), await seeded(travelerAuth, 'bookingitems'), await seeded(travelerAuth, 'payments'), await seeded(travelerAuth, 'hosts'), await seeded(travelerAuth, 'listings')];

	check('traveler sees their booking, package and item; no payments, hosts or listings', traveler.join() === '1,1,1,0,0,0', traveler.join(' / '));

	const guest = [await seeded(null, 'destinations'), await seeded(null, 'reviews'), await seeded(null, 'hosts'), await seeded(null, 'listings'), await seeded(null, 'bookings')];

	check('guest sees destinations and reviews; no hosts, listings or bookings', guest.join() === `6,${seed.reviews.length},0,0,0`, guest.join(' / '));

	console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed. Test user passwords were reset: run test-users.js to get new ones.`);

	return results.every(Boolean);
}

async function main() {
	if (!process.argv.includes('--verify-only')) {
		await load();
	}

	process.exitCode = (await verify()) ? 0 : 1;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
