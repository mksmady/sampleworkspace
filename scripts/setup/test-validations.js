// Checks the expression validation rules (docs/data-model.md section 5): POSTs an invalid entry per rule
// and expects it to be rejected with that rule's message. Nothing should be created; if an invalid entry
// is accepted, its id is reported so it can be removed (this script never deletes).
// The microservice rules are tested by e2e.js once mb-actions-service runs.
//
// Usage: node scripts/setup/test-validations.js

const liferay = require('./lib/liferay');

const PHONE = '+919876543210';

const host = (fields) => ({
	displayName: 'Validation Test',
	handle: 'validation-test',
	hostOffers: [{key: 'fullTrip'}],
	hostRole: {key: 'localTripHost'},
	phone: PHONE,
	termsAccepted: true,
	...fields,
});

const booking = (fields) => ({
	bookingStatus: {key: 'pendingPayment'},
	email: 'lead@example.com',
	leadName: 'Validation Test',
	phone: PHONE,
	travelDate: '2026-12-01',
	travelerCount: 2,
	...fields,
});

const CASES = [
	['hosts', host({phone: '12345'}), 'Enter a valid Indian mobile number'],

	// A required Boolean set to false counts as "no value", so Liferay rejects it before the rule runs.

	['hosts', host({termsAccepted: false}), ['Please accept the host terms', 'No value was provided for required object field "termsAccepted"']],
	['hosts', host({handle: 'Not A Handle'}), 'Use 3–30 lowercase letters'],
	['hosts', host({quote: 'x'.repeat(161)}), 'Keep your quote under 160 characters'],
	['hosts', host({}), 'Choose your destination'],
	['travelers', {fullName: 'Validation Test', phone: '+911234'}, 'Enter a valid Indian mobile number'],
	['partners', {name: 'Validation Test', partnerType: {key: 'hotel'}, phone: '999'}, 'Enter a valid Indian mobile number'],
	['partners', {email: 'not-an-email', name: 'Validation Test', partnerType: {key: 'hotel'}}, 'Enter a valid email address'],
	['partners', {gstin: 'ABC', name: 'Validation Test', partnerType: {key: 'hotel'}}, 'Invalid GSTIN'],
	['bookings', booking({phone: '0000'}), 'Enter a valid Indian mobile number'],
	['bookings', booking({email: 'nope'}), 'Enter a valid email address'],
	['bookings', booking({travelerCount: 0}), 'Traveler count must be at least 1'],
	['bookings', booking({}), 'Choose the host account for this booking'],
	['reviews', {rating: 6}, 'Rating must be 1–5'],
	['reviews', {rating: 5}, "Choose the host you're reviewing"],
	['favorites', {}, 'Choose a host or listing to save'],
	['hostapplications', {applicationType: 'signUp', phone: '12345'}, 'Enter a valid Indian mobile number'],
	['hostapplications', {applicationType: 'signUp', handle: 'Not A Handle'}, 'Use 3–30 lowercase letters'],
	['hostapplications', {applicationType: 'profileEdit', quote: 'x'.repeat(161)}, 'Keep your quote under 160 characters'],
	['availabilityslots', {capacity: 0, slotDate: '2026-12-01', slotStatus: {key: 'open'}}, 'Capacity must be at least 1'],
	['conversations', {subject: 'Validation Test'}, 'Choose the host account for this conversation'],
	['messages', {body: 'Validation Test', senderType: {key: 'traveler'}}, 'Choose the host account for this message'],
];

async function main() {
	let failures = 0;

	for (const [path, body, expected] of CASES) {
		const messages = [].concat(expected);
		let result;

		try {
			const created = await liferay.post(`/o/c/${path}`, body);

			result = `FAIL accepted (created id ${created.id}; remove it)`;
		}
		catch (error) {
			// Error details are JSON inside JSON, so quotes and non-ASCII characters (the en dash in "1–5")
			// arrive escaped.

			const text = error.message
				.replace(/\\+u([0-9a-f]{4})/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
				.replace(/\\/g, '');

			result = messages.some((message) => text.includes(message)) ? 'OK  ' : `FAIL rejected, but not with "${messages[0]}": ${text.slice(0, 300)}`;
		}

		failures += result.startsWith('FAIL') ? 1 : 0;
		console.log(`  ${result}  ${path.padEnd(18)} ${messages[0]}`);
	}

	console.log(`\n${CASES.length - failures}/${CASES.length} invalid entries rejected with the right message.`);
	process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
