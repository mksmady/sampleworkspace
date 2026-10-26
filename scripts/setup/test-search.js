// Checks mb-search-service against docs/search.md section 11, on the seed data (seed.js). Read-only,
// except that every search is logged to MB_SearchQueryLog, as all searches are.
//
// Usage: node scripts/setup/test-search.js   (SEARCH_URL defaults to http://localhost:58082)

const SEARCH_URL = (process.env.SEARCH_URL || 'http://localhost:58082').replace(/\/$/, '');

const results = [];

function check(text, ok, detail = '') {
	results.push(ok);
	console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${text}${detail !== '' ? `  (${detail})` : ''}`);
}

async function search(path) {
	const response = await fetch(SEARCH_URL + path);

	return {body: await response.json(), status: response.status};
}

const handles = (body) => body.items.map((item) => item.handle);
const slugs = (body) => body.items.map((item) => item.slug);
const isoDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const PRIVATE_HOST_FIELDS = ['phone', 'payoutUpiId', 'commissionRate', 'termsAccepted', 'earningsThisMonth', 'availableBalance', 'r_userHost_userId', 'r_accountHosts_accountEntryId'];

async function main() {
	console.log(`Search tests (${SEARCH_URL}):`);

	let {body} = await search('/search/hosts?q=manali');

	check('"manali" returns Rahul first', handles(body)[0] === 'rahul-manali', handles(body).join(','));

	for (const q of ['srinagar', 'gulmarg']) {
		({body} = await search(`/search/hosts?q=${q}`));
		check(`"${q}" returns Irfan (destination keywords)`, handles(body).includes('irfan-kashmir'), handles(body).join(','));
	}

	({body} = await search('/search/hosts?q=udaipr'));
	check('"udaipr" (typo) returns Priya', handles(body)[0] === 'priya-udaipur', handles(body).join(','));

	({body} = await search('/search/hosts?q=homestay%20udaipur'));
	check('"homestay udaipur" returns Priya', handles(body).join() === 'priya-udaipur', handles(body).join(','));

	({body} = await search('/search/hosts?q=rafting'));
	check('"rafting" returns Amit on /search/hosts', handles(body)[0] === 'amit-rishikesh', handles(body).join(','));

	({body} = await search('/search/trips?q=rafting'));
	// The featured, in-season Rishikesh trip ("rafting trip" in its keywords) may outrank the plain rafting
	// listing: both must lead.

	check('"rafting" returns the rafting listing and the Rishikesh trip first on /search/trips', slugs(body).slice(0, 2).sort().join() === 'rishikesh-adventure-trip,rishikesh-river-rafting', slugs(body).join(','));

	({body} = await search('/search/hosts?fullTrip=true'));
	check('fullTrip=true: Rahul, Amit and Irfan, not Priya', ['rahul-manali', 'amit-rishikesh', 'irfan-kashmir'].every((handle) => handles(body).includes(handle)) && !handles(body).includes('priya-udaipur'), handles(body).join(','));

	({body} = await search('/search/hosts?sort=rating&pageSize=8'));

	const card = (handle) => body.items.find((item) => item.handle === handle);
	const rahul = card('rahul-manali');
	const priya = card('priya-udaipur');

	check('Rahul: "Complete trips from ₹8,999", can arrange the entire trip', rahul?.price?.label === 'completeTripsFrom' && Number(rahul.price.amount) === 8999 && rahul.canArrangeEntireTrip === true, JSON.stringify(rahul?.price));
	check('Priya: "From ₹1,499", no complete trips', priya?.price?.label === 'priceFrom' && Number(priya.price.amount) === 1499 && priya.canArrangeEntireTrip === false, JSON.stringify(priya?.price));
	check('Rahul: card fields (role, verified, place, rating, tags)', rahul?.hostRole?.label === 'Local Trip Host' && rahul.verified === true && rahul.destinationName === 'Manali' && rahul.stateName === 'Himachal Pradesh' && Number(rahul.rating) === 4.7 && rahul.reviewCount === 3 && rahul.specialties.some((tag) => tag.label === 'Stay'), `${rahul?.hostRole?.label} ${rahul?.rating}·${rahul?.reviewCount}`);

	const leaks = body.items.flatMap((item) => PRIVATE_HOST_FIELDS.filter((field) => field in item));

	check('Host results never include private fields', !leaks.length, leaks.join(','));

	({body} = await search('/search/hosts?destination=kashmir'));
	check('destination=kashmir returns only Irfan', handles(body).join() === 'irfan-kashmir', handles(body).join(','));

	({body} = await search(`/search/hosts?from=${isoDate(3)}&to=${isoDate(5)}&guests=2`));
	check('dates and 2 guests: the four seed hosts have availability', ['rahul-manali', 'priya-udaipur', 'amit-rishikesh', 'irfan-kashmir'].every((handle) => handles(body).includes(handle)), handles(body).join(','));

	({body} = await search(`/search/hosts?from=${isoDate(3)}&to=${isoDate(5)}&guests=20`));
	check('20 guests: no host has a slot that big', body.totalCount === 0, handles(body).join(','));

	({body} = await search(`/search/hosts?q=kashmir&from=${isoDate(3)}&to=${isoDate(4)}&guests=3`));

	const irfan = body.items[0];

	check('3 guests in Kashmir: Irfan stays; complete trip (8) and shikara (4) count, houseboat (2 places) does not', irfan?.handle === 'irfan-kashmir' && irfan.availableListingCount === 2 && Number(irfan.price.amount) === 9499, `${irfan?.availableListingCount} listing(s), ${JSON.stringify(irfan?.price)}`);

	({body} = await search('/search/trips?category=completeTrip'));
	check('Complete Trips page: complete trips only, including the three seed trips', ['manali-complete-trip', 'rishikesh-adventure-trip', 'kashmir-complete-trip'].every((slug) => slugs(body).includes(slug)) && body.items.every((item) => item.category === 'completeTrip' && item.host?.handle), slugs(body).join(','));

	({body} = await search('/search/trips?q=complete%20trip'));
	check('Pinned: "complete trip" puts the Manali trip first', slugs(body)[0] === 'manali-complete-trip', slugs(body).join(','));

	let response = await search('/search/hosts/rahul-manali');

	check('Host profile: Rahul\'s listings (complete trip first) and published reviews', response.status === 200 && response.body.listings[0]?.category === 'completeTrip' && response.body.listings.length === 3 && response.body.reviews.length === 3, `${response.body.listings?.length} listings, ${response.body.reviews?.length} reviews`);

	response = await search('/search/hosts/irfan-kashmir');
	check('Host profile: the unpublished review is not shown', response.body.reviews.length === 2 && !response.body.reviews.some((review) => review.comment === 'Awaiting moderation.'), response.body.reviews.length);

	response = await search('/search/hosts/nobody-here');
	check('Unknown host: 404', response.status === 404, response.status);

	response = await search('/search/listings/manali-complete-trip');
	check('Listing page: inclusions, add-on, slots and host', response.status === 200 && response.body.inclusions.length === 5 && response.body.inclusions.some((inclusion) => inclusion.inclusionType === 'addOn' && Number(inclusion.addOnPrice) === 3000) && response.body.slots.length > 0 && response.body.host?.handle === 'rahul-manali', `${response.body.inclusions?.length} inclusions, ${response.body.slots?.length} slots`);

	({body} = await search('/search/suggest?q=sri'));
	check('Suggest "sri" offers Kashmir', body.items.some((item) => item.type === 'destination' && item.text === 'Kashmir'), body.items.map((item) => item.text).join(','));

	response = await search('/search/hosts?sort=nope');
	check('Invalid sort: 400', response.status === 400, response.status);

	response = await search('/search/hosts?from=2026-12-10&to=2026-12-01');
	check('to before from: 400', response.status === 400, response.status);

	console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed.`);
	process.exitCode = results.every(Boolean) ? 0 : 1;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
