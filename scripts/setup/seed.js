// LOCAL INSTANCE ONLY. Loads the seed data in data/seed/ (docs/data-model.md section 9), approves the
// seeded Hosts and Listings as the ops test user, then verifies the result with GETs.
// Idempotent: entries are looked up by ERC (MB_SEED_...), created when missing and patched only where
// they differ, so a rerun changes nothing (except adding availability slots for new days). Nothing is
// ever deleted. Needs the test users from test-users.js.
//
// Usage: node scripts/setup/seed.js [--verify-only]

const crypto = require('crypto');

const liferay = require('./lib/liferay');
const picklists = require('./data/picklists.json');
const seed = require('./data/seed/seed.json');
const {holidays} = require('./data/seed/holidays.json');

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(liferay.baseURL)) {
	console.error(`Seed data is for the local instance only; LIFERAY_URL is ${liferay.baseURL}.`);
	process.exit(1);
}

const USERS = '/o/headless-admin-user/v1.0';
const WORKFLOW = '/o/headless-admin-workflow/v1.0';

// Travelers can't see Hosts or Listings (docs/data-model.md 6.2), so relationships to them are added by
// the admin after the traveler creates the entry.

const TRAVELER_CANNOT_REFERENCE = /^r_(hostPackages|hostBookings|listingBookingItems)_/;

const counts = {};
const label = (listTypeERC, key) => picklists.find((picklist) => picklist.erc === listTypeERC).entries[key];

// ---- Users acting on the instance -------------------------------------------------------------------

async function userAuth(erc, email) {
	const secret = `Mb-${crypto.randomBytes(9).toString('base64url')}7!`;

	await liferay.patch(`${USERS}/user-accounts/by-external-reference-code/${erc}`, {password: secret});

	return 'Basic ' + Buffer.from(`${email}:${secret}`).toString('base64');
}

async function as(auth, method, path, body) {
	const response = await fetch(liferay.baseURL + path, {
		body: body && JSON.stringify(body),
		headers: {Accept: 'application/json', Authorization: auth, 'Content-Type': 'application/json'},
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

// ---- Derived seed values -----------------------------------------------------------------------------

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

function listingEntry({entry, key}) {
	const destination = seed.destinations.find((item) => item.externalReferenceCode === entry.destination);
	const host = seed.hosts.find((item) => item.externalReferenceCode === entry.host);
	const {account, destination: destinationERC, host: hostERC, partner, ...fields} = entry;
	const today = isoDate(new Date());

	return {
		...fields,

		// Denormalized for search (docs/search.md section 3); phase 7 actions keep these in sync.

		destinationName: destination.name,
		hostDisplayName: host.displayName,
		latitude: destination.latitude,
		longitude: destination.longitude,
		nextAvailableDate: slotDates(key).find((date) => date > today),
		region: destination.region,
		stateName: label('MB_IndianState', destination.state),
		r_accountListings_accountEntryERC: account,
		r_destinationListings_c_destinationERC: destinationERC,
		r_hostListings_c_hostERC: hostERC,
		...(partner && {r_partnerListings_c_partnerERC: partner}),
	};
}

// A long weekend is the run of days off around the holiday, bridging at most two working days.

function longWeekend(date) {
	const day = new Date(`${date}T00:00:00Z`);
	const weekday = day.getUTCDay();
	const shift = (days) => isoDate(new Date(day.getTime() + days * 86400000));

	const plans = {
		0: [-1, 0, 0], // Sunday: Sat-Sun
		1: [-2, 0, 0], // Monday: Sat-Mon
		2: [-3, 0, 1], // Tuesday: Sat-Tue, take Monday off
		3: [0, 4, 2], // Wednesday: Wed-Sun, take Thursday and Friday off
		4: [0, 3, 1], // Thursday: Thu-Sun, take Friday off
		5: [0, 2, 0], // Friday: Fri-Sun
		6: [0, 1, 0], // Saturday: Sat-Sun
	};
	const [start, end, leave] = plans[weekday];

	return {leaveDaysNeeded: leave, longWeekendEnd: shift(end), longWeekendStart: shift(start)};
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- Workflow ----------------------------------------------------------------------------------------

async function approvePending(opsAuth, plural, entries) {
	for (const entry of entries) {
		const current = await liferay.get(`/o/c/${plural}/by-external-reference-code/${entry.externalReferenceCode}`);

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
	for (const erc of ['MB_TEST_account_host1', 'MB_TEST_account_host2']) {
		if (!(await liferay.get(`${USERS}/accounts/by-external-reference-code/${erc}`))) {
			throw new Error(`Account ${erc} is missing: run test-users.js first.`);
		}
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

	for (const entry of seed.hostPartnerships) {
		await upsert('hostpartnerships', entry);
	}

	const listings = seed.listings.map(listingEntry);

	for (const entry of listings) {
		await upsert('listings', entry);
	}

	for (const {account, listing, ...entry} of seed.listingInclusions) {
		await upsert('listinginclusions', {...entry, r_accountListingInclusions_accountEntryERC: account, r_listingInclusions_c_listingERC: listing});
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

	const {as: travelerOwned, ...traveler} = seed.traveler;

	await upsert('travelers', traveler, {creator: travelerOwned && travelerAuth});

	const {as: packageOwner, ...tripPackage} = seed.tripPackage;

	await upsert('trippackages', tripPackage, {creator: packageOwner && travelerAuth});

	const booking = await upsert('bookings', seed.booking.entry, {creator: seed.booking.as && travelerAuth});

	// Walk the booking through its state flow (pendingPayment -> confirmed); skip steps already taken.

	const flow = seed.booking.bookingStatusFlow;
	const at = flow.indexOf(booking.bookingStatus?.key);

	for (const status of flow.slice(at + 1)) {
		await liferay.patch(`/o/c/bookings/${booking.id}`, {bookingStatus: status});
		console.log(`  status    ${seed.booking.entry.externalReferenceCode} -> ${status}`);
	}

	for (const {as: itemOwner, slot, ...item} of seed.bookingItems) {
		await upsert('bookingitems', {
			...item,
			...(slot && {r_slotBookingItems_c_availabilitySlotERC: slotERC(slot.listing, slot.date)}),
		}, {creator: itemOwner && travelerAuth});
	}

	for (const entry of seed.payments) {
		await upsert('payments', entry);
	}

	for (const entry of seed.commissions) {
		await upsert('commissions', entry);
	}

	for (const holiday of holidays) {
		await upsert('publicholidays', {
			externalReferenceCode: `MB_SEED_holiday_${holiday.date}_${slug(holiday.name)}`,
			holidayDate: holiday.date,
			name: holiday.name,
			...longWeekend(holiday.date),
		});
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
	const get = (plural, erc) => liferay.get(`/o/c/${plural}/by-external-reference-code/${erc}`);

	console.log('\nVerification (GET by ERC):');

	const expected = [
		['destinations', seed.destinations.map((entry) => entry)],
		['partners', seed.partners],
		['hosts', seed.hosts],
		['hostpartnerships', seed.hostPartnerships],
		['listings', seed.listings.map(listingEntry)],
		['listinginclusions', seed.listingInclusions.map(({account, listing, ...entry}) => ({...entry, r_accountListingInclusions_accountEntryERC: account, r_listingInclusions_c_listingERC: listing}))],
		['travelers', [(({as: ignored, ...entry}) => entry)(seed.traveler)]],
		['trippackages', [(({as: ignored, ...entry}) => entry)(seed.tripPackage)]],
		['bookings', [seed.booking.entry]],
		['bookingitems', seed.bookingItems.map(({as: ignored, slot, ...item}) => ({...item, ...(slot && {r_slotBookingItems_c_availabilitySlotERC: slotERC(slot.listing, slot.date)})}))],
		['payments', seed.payments],
		['commissions', seed.commissions],
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

	let holidaysFound = 0;

	for (const holiday of holidays) {
		const actual = await get('publicholidays', `MB_SEED_holiday_${holiday.date}_${slug(holiday.name)}`);

		holidaysFound += actual && same(holiday.date, actual.holidayDate) && same(longWeekend(holiday.date).longWeekendStart, actual.longWeekendStart) ? 1 : 0;
	}

	check('public holidays with long weekends', holidaysFound === holidays.length, `${holidaysFound}/${holidays.length}`);

	for (const [plural, entries] of [['hosts', seed.hosts], ['listings', seed.listings.map(({entry}) => entry)]]) {
		const statuses = [];

		for (const entry of entries) {
			statuses.push((await get(plural, entry.externalReferenceCode)).status?.label);
		}

		check(`${plural} are approved`, statuses.every((status) => status === 'approved'), statuses.join(','));
	}

	const booking = await get('bookings', 'MB_SEED_booking_bir');
	const tripPackage = await get('trippackages', 'MB_SEED_package_bir');
	const host = await get('hosts', 'MB_SEED_host_bir');
	const slot = await get('availabilityslots', slotERC('paragliding', '2026-10-09'));

	check('Booking is confirmed with a booking number', booking.bookingStatus?.key === 'confirmed' && /^MB-\d+$/.test(booking.bookingNumber), `${booking.bookingStatus?.key} ${booking.bookingNumber}`);
	check('Booking.subtotal = 25000 (sum of items)', Number(booking.subtotal) === 25000, booking.subtotal);
	check('Booking.total = subtotal + fee + GST = 26475', Number(booking.subtotal) + Number(booking.serviceFee) + Number(booking.taxes) === Number(booking.total) && Number(booking.total) === 26475, booking.total);
	check('TripPackage.itemCount = 3, packageTotal = 25000', Number(tripPackage.itemCount) === 3 && Number(tripPackage.packageTotal) === 25000, `${tripPackage.itemCount} / ${tripPackage.packageTotal}`);
	check('Bir host: partnerCount 1, totalBookings 1', Number(host.partnerCount) === 1 && Number(host.totalBookings) === 1, `${host.partnerCount} / ${host.totalBookings}`);
	check('Paragliding slot on 2026-10-09: bookedCount 2', Number(slot.bookedCount) === 2, slot.bookedCount);

	console.log('\nAs the test users:');

	const hostAuth1 = await userAuth('MB_TEST_user_host1', 'mb.test.host1@example.com');
	const hostAuth2 = await userAuth('MB_TEST_user_host2', 'mb.test.host2@example.com');
	const travelerAuth = await userAuth('MB_TEST_user_traveler', 'mb.test.traveler@example.com');
	const seeded = async (auth, plural) =>
		(await as(auth, 'GET', `/o/c/${plural}?pageSize=200`)).items.filter((item) => item.externalReferenceCode.startsWith('MB_SEED_')).length;

	check('host1 sees their 5 listings and 1 booking', (await seeded(hostAuth1, 'listings')) === 5 && (await seeded(hostAuth1, 'bookings')) === 1);
	check('host2 sees their 2 listings and no booking', (await seeded(hostAuth2, 'listings')) === 2 && (await seeded(hostAuth2, 'bookings')) === 0);
	check('traveler sees their booking, package and 3 items', (await seeded(travelerAuth, 'bookings')) === 1 && (await seeded(travelerAuth, 'trippackages')) === 1 && (await seeded(travelerAuth, 'bookingitems')) === 3);

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
