/**
 * Maddybaba website custom elements (phase 10a). Plain JS, no build step. Every element renders into
 * the light DOM so mb-web.css styles it. All client extensions of mb-web-elements load this same file,
 * so each element is defined only once.
 *
 * Data: mb-search-service's public /search API (docs/search.md 8). Its address defaults to the local
 * service; another environment sets window.MBConfig = {searchURL: '…'} (e.g. in a JS client extension).
 */
(function () {
	if (window.MB) {
		return;
	}

	const CATEGORIES = [
		{key: 'flight', label: 'Flight tickets', text: 'Domestic & international', icon: 'plane'},
		{key: 'stay', label: 'Stays', text: 'Hotels, resorts, homestays', icon: 'bed'},
		{key: 'camping', label: 'Camping', text: 'Riverside & mountain camps', icon: 'tent'},
		{key: 'trekking', label: 'Trekking', text: 'Guided day & multi-day treks', icon: 'mountain'},
		{key: 'paragliding', label: 'Paragliding', text: 'Tandem flights, courses', icon: 'glider'},
		{key: 'localGuide', label: 'Local guides', text: 'City tours, classes & more', icon: 'compass'},
		{key: 'activity', label: 'Activities', text: 'Rafting, diving, classes', icon: 'spark'},
		{key: 'tourPackage', label: 'Tour packages', text: 'Everything in one booking', icon: 'bag'},
	];

	const PRICE_UNITS = {perGroup: 'per group', perNight: 'per night', perPerson: 'per person', perRoom: 'per room', perTrip: 'per trip'};

	const SORTS = [
		['relevance', 'Best match'],
		['priceAsc', 'Price: low to high'],
		['priceDesc', 'Price: high to low'],
		['rating', 'Top rated'],
	];

	const ICONS = {
		arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
		bag: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
		bed: '<path d="M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="1.5"/>',
		compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
		glider: '<path d="M3 9c3-3 15-3 18 0l-9 3z"/><path d="M12 12v6M8 20h8"/>',
		mountain: '<path d="M3 19l6-10 4 6 2-3 6 7z"/>',
		pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
		plane: '<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l5-5"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
		spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
		star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.4l-5.5 3 1-6.3L3 9.7l6.2-.9z"/>',
		tent: '<path d="M3 20L12 5l9 15z"/><path d="M12 20l-3-6h6z"/>',
	};

	function icon(name) {
		return `<svg class="mb-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
	}

	function esc(value) {
		return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
	}

	// Hosts write listing descriptions; show them as text paragraphs, never as HTML.

	function paragraphs(html) {
		const text = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html').body.innerText || '';

		return text.split(/\n\s*\n|\n/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${esc(line)}</p>`).join('');
	}

	function money(amount) {
		if (amount === null || amount === undefined || amount === '') {
			return '';
		}

		return '₹' + Number(amount).toLocaleString('en-IN', {maximumFractionDigits: 2});
	}

	function categoryLabel(key) {
		return (CATEGORIES.find((category) => category.key === key) || {label: key}).label;
	}

	function searchURL() {
		return ((window.MBConfig && window.MBConfig.searchURL) || 'http://localhost:58082').replace(/\/$/, '');
	}

	// Pages are top-level pages of the site, so a page's URL is the current page's URL with its last
	// segment replaced. Works under /web/<site>/ and when the site is the instance's default site.

	function pageURL(page, params) {
		let current = location.pathname;

		try {
			current = Liferay.ThemeDisplay.getLayoutRelativeURL() || current;
		}
		catch (error) {
			// Outside Liferay: use the browser path.
		}

		const query = new URLSearchParams(Object.entries(params || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined));

		return current.replace(/\/[^/]*$/, '') + '/' + page + (query.toString() ? '?' + query : '');
	}

	async function getJSON(path) {
		const response = await fetch(searchURL() + path, {headers: {Accept: 'application/json'}});

		if (response.status === 404) {
			return null;
		}

		if (!response.ok) {
			throw new Error(`${response.status}`);
		}

		return response.json();
	}

	// Liferay.Util.fetch adds the session and CSRF token, so guests and signed-in users can post.

	function liferayFetch(url, options) {
		return (window.Liferay && Liferay.Util && Liferay.Util.fetch ? Liferay.Util.fetch : fetch)(url, options);
	}

	function signedIn() {
		try {
			return Liferay.ThemeDisplay.isSignedIn();
		}
		catch (error) {
			return false;
		}
	}

	function stars(rating, reviewCount) {
		if (!reviewCount) {
			return '<span class="mb-rating mb-rating--new">New</span>';
		}

		return `<span class="mb-rating">${icon('star')} ${Number(rating).toFixed(1)} <span class="mb-muted">(${reviewCount})</span></span>`;
	}

	// Placeholder art until listings and hosts have photos: a gradient tile with the category icon.

	function picture(url, category, alt) {
		if (url) {
			return `<img class="mb-picture" src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`;
		}

		const {icon: name} = CATEGORIES.find((item) => item.key === category) || {icon: 'mountain'};

		return `<div class="mb-picture mb-picture--placeholder mb-picture--${esc(category || 'none')}" role="img" aria-label="${esc(alt)}">${icon(name)}</div>`;
	}

	function listingCard(item) {
		const unit = PRICE_UNITS[item.price && item.price.unit] || '';

		return `
			<a class="mb-card mb-listing-card" href="${esc(pageURL('listing', {slug: item.slug}))}">
				${picture(item.heroImageUrl, item.category, item.title)}
				<div class="mb-card__body">
					<div class="mb-card__meta"><span class="mb-chip">${esc(categoryLabel(item.category))}</span>${stars(item.rating, item.reviewCount)}</div>
					<h3 class="mb-card__title">${esc(item.title)}</h3>
					<p class="mb-muted">${icon('pin')} ${esc([item.destinationName, item.stateName].filter(Boolean).join(', '))}</p>
					<p class="mb-card__price"><strong>${esc(money(item.price && item.price.amount))}</strong> <span class="mb-muted">${esc(unit)}</span></p>
				</div>
			</a>`;
	}

	function state(element, html) {
		element.innerHTML = `<div class="mb-wrap mb-state">${html}</div>`;
	}

	class MBElement extends HTMLElement {
		connectedCallback() {
			if (!this._rendered) {
				this._rendered = true;
				this.render();
			}
		}
	}

	// Header: brand, main navigation, log in / start hosting. Its presence hides the theme's header
	// and footer (mb-web.css).

	class MBSiteHeader extends MBElement {
		render() {
			const account = signedIn()
				? `<span class="mb-header__user">${esc(Liferay.ThemeDisplay.getUserName())}</span><a class="mb-button mb-button--ghost" href="/c/portal/logout">Sign out</a>`
				: `<a class="mb-button mb-button--ghost" href="/c/portal/login">Log in</a>`;

			this.innerHTML = `
				<header class="mb-header">
					<div class="mb-wrap mb-header__bar">
						<a class="mb-brand" href="${esc(pageURL('home'))}"><span class="mb-brand__mark">mb</span> Maddybaba</a>
						<nav class="mb-header__nav" aria-label="Main">
							<a href="${esc(pageURL('search'))}">Explore</a>
							<a href="${esc(pageURL('search', {category: 'tourPackage'}))}">Tour packages</a>
							<a href="${esc(pageURL('home'))}#become-a-host">Become a host</a>
							<a href="${esc(pageURL('home'))}#how-it-works">How it works</a>
						</nav>
						<div class="mb-header__actions">
							${account}
							<a class="mb-button mb-button--accent" href="${esc(pageURL('home'))}#become-a-host">Start hosting</a>
						</div>
					</div>
				</header>`;
		}
	}

	// Search form: where, dates, travelers, category. Submits to the search page; prefilled from the
	// current URL so the results page shows what was searched.

	class MBSearchBox extends MBElement {
		render() {
			const params = new URLSearchParams(location.search);
			const listId = 'mb-suggest-' + Math.random().toString(36).slice(2, 8);
			const options = CATEGORIES.map(({key, label}) => `<option value="${key}"${params.get('category') === key ? ' selected' : ''}>${esc(label)}</option>`).join('');

			this.innerHTML = `
				<form class="mb-search-box" role="search">
					<label class="mb-search-box__field">
						<span>Where to?</span>
						<input name="q" list="${listId}" autocomplete="off" placeholder="Bir Billing, Kasol, Rishikesh…" value="${esc(params.get('q') || '')}">
						<datalist id="${listId}"></datalist>
					</label>
					<label class="mb-search-box__field">
						<span>From</span>
						<input name="from" type="date" value="${esc(params.get('from') || '')}">
					</label>
					<label class="mb-search-box__field">
						<span>To</span>
						<input name="to" type="date" value="${esc(params.get('to') || '')}">
					</label>
					<label class="mb-search-box__field mb-search-box__field--small">
						<span>Travelers</span>
						<input name="travelers" type="number" min="1" max="50" placeholder="2" value="${esc(params.get('travelers') || '')}">
					</label>
					<label class="mb-search-box__field">
						<span>Looking for</span>
						<select name="category"><option value="">Anything</option>${options}</select>
					</label>
					<button class="mb-button mb-button--primary" type="submit">${icon('search')} Search</button>
				</form>`;

			const form = this.querySelector('form');
			const input = form.elements.q;
			const datalist = this.querySelector('datalist');
			let timer;

			input.addEventListener('input', () => {
				clearTimeout(timer);
				timer = setTimeout(async () => {
					if (input.value.trim().length < 2) {
						return;
					}

					try {
						const {items} = await getJSON('/search/suggest?q=' + encodeURIComponent(input.value.trim()));

						datalist.innerHTML = items.map((item) => `<option value="${esc(item.text)}">`).join('');
					}
					catch (error) {
						datalist.innerHTML = '';
					}
				}, 250);
			});

			form.addEventListener('submit', (event) => {
				event.preventDefault();

				const values = Object.fromEntries(new FormData(form));

				location.href = pageURL('search', values);
			});
		}
	}

	class MBHeroSearch extends MBElement {
		render() {
			this.innerHTML = `
				<section class="mb-hero">
					<div class="mb-wrap mb-hero__grid">
						<div>
							<p class="mb-eyebrow">When in doubt, book tickets</p>
							<h1 class="mb-hero__title">Travel. Host. Earn. <em>With zero investment.</em></h1>
							<p class="mb-hero__text">Book stays, tickets, treks and paragliding through trusted local hosts — or become one yourself, without owning a single property.</p>
							<div class="mb-actions">
								<a class="mb-button mb-button--accent" href="${esc(pageURL('search'))}">Explore trips ${icon('arrow')}</a>
								<a class="mb-button mb-button--outline-light" href="#become-a-host">Become a host</a>
							</div>
						</div>
						<svg class="mb-hero__art" viewBox="0 0 400 400" aria-hidden="true">
							<circle cx="200" cy="200" r="195" fill="#3a2fd0"/>
							<circle cx="200" cy="200" r="180" fill="#dce1ff"/>
							<clipPath id="mb-hero-clip"><circle cx="200" cy="200" r="180"/></clipPath>
							<g clip-path="url(#mb-hero-clip)">
								<path d="M0 260 L90 130 L170 230 L250 90 L400 270 V400 H0Z" fill="#6c63e8"/>
								<path d="M0 300 L110 190 L200 260 L300 170 L400 250 V400 H0Z" fill="#2416b4"/>
								<ellipse cx="200" cy="360" rx="230" ry="60" fill="#120a5f"/>
								<path d="M140 330 L170 280 L200 330Z" fill="#ff7b3d"/>
								<path d="M215 325 L237 292 L259 325Z" fill="#ffab85"/>
							</g>
							<circle cx="300" cy="110" r="42" fill="#ff7b3d"/>
							<path d="M268 140 L292 170 L322 136" stroke="#120a5f" stroke-width="2" fill="none"/>
						</svg>
					</div>
					<div class="mb-wrap"><mb-search-box></mb-search-box></div>
				</section>`;
		}
	}

	class MBCategories extends MBElement {
		render() {
			const tiles = CATEGORIES.slice(0, 6).map(({key, label, text, icon: name}, index) => `
				<a class="mb-card mb-category mb-category--${index % 2 ? 'accent' : 'primary'}" href="${esc(pageURL('search', {category: key}))}">
					<span class="mb-category__icon">${icon(name)}</span>
					<strong>${esc(label)}</strong>
					<span class="mb-muted">${esc(text)}</span>
				</a>`).join('');

			this.innerHTML = `
				<section class="mb-section">
					<div class="mb-wrap">
						<div class="mb-section__head">
							<h2 class="mb-title">The whole trip, in one place.</h2>
							<p class="mb-muted">Tickets, stays and adventures — recommended and booked through people who actually live there.</p>
						</div>
						<div class="mb-grid mb-grid--6">${tiles}</div>
					</div>
				</section>`;
		}
	}

	// Search page: search box, filters (category, state, price, sort), results, pagination.

	class MBSearchResults extends MBElement {
		render() {
			this.innerHTML = `
				<section class="mb-section mb-section--tight">
					<div class="mb-wrap">
						<mb-search-box></mb-search-box>
						<div class="mb-results">
							<aside class="mb-filters" aria-label="Filters"></aside>
							<div class="mb-results__main" aria-live="polite"></div>
						</div>
					</div>
				</section>`;
			this.load();
		}

		async load() {
			const params = new URLSearchParams(location.search);
			const main = this.querySelector('.mb-results__main');

			params.set('source', 'web');
			main.innerHTML = '<p class="mb-muted">Searching…</p>';

			let response;

			try {
				response = await getJSON('/search/trips?' + params);
			}
			catch (error) {
				main.innerHTML = '<p class="mb-error">Search is unavailable right now. Please try again in a moment.</p>';

				return;
			}

			this.renderFilters(response);

			const {destinations = [], hosts = [], items, page, pageSize, totalCount} = response;
			const pages = Math.ceil(totalCount / pageSize);
			const query = params.get('q');

			const related = [
				...destinations.map((destination) => `<a class="mb-chip mb-chip--link" href="${esc(pageURL('search', {q: destination.name}))}">${icon('pin')} ${esc(destination.name)}</a>`),
				...hosts.map((host) => `<a class="mb-chip mb-chip--link" href="${esc(pageURL('host', {handle: host.handle}))}">${esc(host.displayName)}</a>`),
			].join('');

			const pager = pages > 1
				? `<nav class="mb-pager" aria-label="Pages">${Array.from({length: pages}, (_, index) => index + 1).map((number) => (number === page
					? `<span class="mb-pager__current" aria-current="page">${number}</span>`
					: `<a href="${esc(this.withParam('page', number))}">${number}</a>`)).join('')}</nav>`
				: '';

			main.innerHTML = `
				<div class="mb-results__head">
					<h1 class="mb-title mb-title--small">${totalCount} ${totalCount === 1 ? 'trip' : 'trips'}${query ? ` for “${esc(query)}”` : ''}</h1>
					<label class="mb-sort">Sort <select>${SORTS.map(([key, label]) => `<option value="${key}"${(params.get('sort') || 'relevance') === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
				</div>
				${related ? `<div class="mb-related">${related}</div>` : ''}
				${items.length
					? `<div class="mb-grid mb-grid--3">${items.map(listingCard).join('')}</div>`
					: `<div class="mb-empty"><h2>No trips match yet</h2><p class="mb-muted">Try other dates, fewer filters or a nearby place.</p><a class="mb-button mb-button--primary" href="${esc(pageURL('search'))}">See all trips</a></div>`}
				${pager}`;

			main.querySelector('.mb-sort select').addEventListener('change', (event) => {
				location.href = this.withParam('sort', event.target.value);
			});
		}

		renderFilters({facets = {}}) {
			const params = new URLSearchParams(location.search);
			const facet = (name, title, labelOf) => {
				const values = facets[name] || [];

				if (!values.length) {
					return '';
				}

				return `
					<fieldset class="mb-filter">
						<legend>${title}</legend>
						${values.map(({count, key, label}) => {
							const active = params.get(name) === key;

							return `<a class="mb-filter__option${active ? ' is-active' : ''}" href="${esc(this.withParam(name, active ? '' : key))}">${esc(labelOf ? labelOf(key) : label)} <span class="mb-muted">${count}</span></a>`;
						}).join('')}
					</fieldset>`;
			};

			const filters = this.querySelector('.mb-filters');

			// The API has no state filter parameter, so the state facet links search for the state name.

			filters.innerHTML = `
				${facet('category', 'Category', categoryLabel)}
				${(facets.state || []).length ? `
					<fieldset class="mb-filter">
						<legend>State</legend>
						${facets.state.map(({count, label}) => `<a class="mb-filter__option" href="${esc(this.withParam('q', label))}">${esc(label)} <span class="mb-muted">${count}</span></a>`).join('')}
					</fieldset>` : ''}
				<form class="mb-filter mb-price">
					<fieldset>
						<legend>Price (₹)</legend>
						<input name="minPrice" type="number" min="0" placeholder="Min" value="${esc(params.get('minPrice') || '')}" aria-label="Minimum price">
						<input name="maxPrice" type="number" min="0" placeholder="Max" value="${esc(params.get('maxPrice') || '')}" aria-label="Maximum price">
						<button class="mb-button mb-button--small" type="submit">Apply</button>
					</fieldset>
				</form>`;

			filters.querySelector('.mb-price').addEventListener('submit', (event) => {
				event.preventDefault();

				const next = new URLSearchParams(location.search);

				for (const name of ['minPrice', 'maxPrice']) {
					const value = event.target.elements[name].value;

					value ? next.set(name, value) : next.delete(name);
				}

				next.delete('page');
				location.search = next;
			});
		}

		withParam(name, value) {
			const params = new URLSearchParams(location.search);

			value ? params.set(name, value) : params.delete(name);

			if (name !== 'page') {
				params.delete('page');
			}

			return location.pathname + (params.toString() ? '?' + params : '');
		}
	}

	// Listing page (?slug=): details, inclusions, open dates for the next 30 days and the host.

	class MBListingDetail extends MBElement {
		async render() {
			const slug = new URLSearchParams(location.search).get('slug');

			if (!slug) {
				state(this, `<h1 class="mb-title">Choose a trip</h1><a class="mb-button mb-button--primary" href="${esc(pageURL('search'))}">Explore trips</a>`);

				return;
			}

			state(this, '<p class="mb-muted">Loading…</p>');

			let listing;

			try {
				listing = await getJSON('/search/listings/' + encodeURIComponent(slug));
			}
			catch (error) {
				state(this, '<p class="mb-error">This trip can’t be loaded right now. Please try again in a moment.</p>');

				return;
			}

			if (!listing) {
				state(this, `<h1 class="mb-title">Trip not found</h1><p class="mb-muted">It may no longer be available.</p><a class="mb-button mb-button--primary" href="${esc(pageURL('search'))}">Explore trips</a>`);

				return;
			}

			document.title = `${listing.title} | Maddybaba`;

			const unit = PRICE_UNITS[listing.price.unit] || '';
			const host = listing.host;
			const included = (listing.inclusions || []).filter((inclusion) => inclusion.inclusionType !== 'addOn');
			const addOns = (listing.inclusions || []).filter((inclusion) => inclusion.inclusionType === 'addOn');
			const inclusions = (title, items) => (items.length
				? `<h2 class="mb-subtitle">${title}</h2><ul class="mb-inclusions">${items.map((item) => `<li>${esc(item.label)}${item.addOnPrice ? ` <span class="mb-muted">+${esc(money(item.addOnPrice))}</span>` : ''}</li>`).join('')}</ul>`
				: '');
			const slots = (listing.slots || []).map((slot) => `
				<li class="mb-slot">
					<strong>${esc(new Date(slot.date + 'T00:00:00').toLocaleDateString('en-IN', {day: 'numeric', month: 'short', weekday: 'short'}))}</strong>
					<span>${esc(slot.startTime || '')}</span>
					<span class="mb-muted">${slot.placesLeft} ${slot.placesLeft === 1 ? 'place' : 'places'} left</span>
					${slot.price ? `<span>${esc(money(slot.price))}</span>` : ''}
				</li>`).join('');

			this.innerHTML = `
				<article class="mb-section mb-section--tight">
					<div class="mb-wrap">
						<p class="mb-breadcrumb"><a href="${esc(pageURL('search'))}">Explore</a> / <a href="${esc(pageURL('search', {category: listing.category}))}">${esc(categoryLabel(listing.category))}</a></p>
						<div class="mb-detail">
							<div>
								${picture(listing.heroImageUrl, listing.category, listing.title)}
								<h1 class="mb-title">${esc(listing.title)}</h1>
								<p class="mb-detail__meta">${icon('pin')} ${esc([listing.destinationName, listing.stateName].filter(Boolean).join(', '))} · ${stars(listing.rating, listing.reviewCount)}${listing.durationText ? ` · ${esc(listing.durationText)}` : ''}</p>
								${listing.shortDescription ? `<p class="mb-lead">${esc(listing.shortDescription)}</p>` : ''}
								<div class="mb-prose">${paragraphs(listing.description)}</div>
								${inclusions('What’s included', included)}
								${inclusions('Add-ons', addOns)}
							</div>
							<aside class="mb-card mb-detail__side">
								<p class="mb-detail__price"><strong>${esc(money(listing.price.amount))}</strong> <span class="mb-muted">${esc(unit)}</span></p>
								${listing.maxGuests ? `<p class="mb-muted">Up to ${esc(listing.maxGuests)} guests</p>` : ''}
								<h2 class="mb-subtitle">Open dates</h2>
								${slots ? `<ul class="mb-slots">${slots}</ul>` : '<p class="mb-muted">No open dates in the next 30 days.</p>'}
							</aside>
						</div>
						${host ? `
							<a class="mb-card mb-host-card" href="${esc(pageURL('host', {handle: host.handle}))}">
								${avatar(host)}
								<div>
									<p class="mb-eyebrow mb-eyebrow--dark">Your host</p>
									<h2 class="mb-subtitle">${esc(host.displayName)}${host.tier === 'superHost' ? ' <span class="mb-chip mb-chip--accent">Super Host</span>' : ''}</h2>
									<p class="mb-muted">${esc(host.hostRegion)}</p>
									<p>${esc(host.bio)}</p>
								</div>
							</a>` : ''}
					</div>
				</article>`;
		}
	}

	function avatar(host) {
		if (host.avatarUrl) {
			return `<img class="mb-avatar" src="${esc(host.avatarUrl)}" alt="">`;
		}

		const initials = (host.displayName || '?').split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();

		return `<span class="mb-avatar mb-avatar--initials" aria-hidden="true">${esc(initials)}</span>`;
	}

	// Host page (?handle=): public profile and approved listings.

	class MBHostProfile extends MBElement {
		async render() {
			const handle = new URLSearchParams(location.search).get('handle');

			if (!handle) {
				state(this, `<h1 class="mb-title">Choose a host</h1><a class="mb-button mb-button--primary" href="${esc(pageURL('search'))}">Explore trips</a>`);

				return;
			}

			state(this, '<p class="mb-muted">Loading…</p>');

			let host;

			try {
				host = await getJSON('/search/hosts/' + encodeURIComponent(handle));
			}
			catch (error) {
				state(this, '<p class="mb-error">This host can’t be loaded right now. Please try again in a moment.</p>');

				return;
			}

			if (!host) {
				state(this, `<h1 class="mb-title">Host not found</h1><a class="mb-button mb-button--primary" href="${esc(pageURL('search'))}">Explore trips</a>`);

				return;
			}

			document.title = `${host.displayName} | Maddybaba`;

			const listings = host.listings || [];

			this.innerHTML = `
				<section class="mb-section mb-section--tight">
					<div class="mb-wrap">
						<div class="mb-profile">
							${avatar(host)}
							<div>
								<h1 class="mb-title">${esc(host.displayName)}${host.tier === 'superHost' ? ' <span class="mb-chip mb-chip--accent">Super Host</span>' : ''}</h1>
								<p class="mb-muted">${icon('pin')} ${esc(host.hostRegion)}</p>
								<p class="mb-related">${(host.specialties || []).map((key) => `<span class="mb-chip">${esc(categoryLabel(key))}</span>`).join('')}</p>
								<p class="mb-lead">${esc(host.bio)}</p>
							</div>
						</div>
						<h2 class="mb-subtitle">Trips by ${esc(host.displayName)}</h2>
						${listings.length ? `<div class="mb-grid mb-grid--3">${listings.map(listingCard).join('')}</div>` : '<p class="mb-muted">No trips listed yet.</p>'}
					</div>
				</section>`;
		}
	}

	// "Notify me" for the app launch: creates an AppWaitlist entry (guests have ADD, data-model.md 6.2).

	class MBAppWaitlist extends MBElement {
		render() {
			this.innerHTML = `
				<section class="mb-section">
					<div class="mb-wrap">
						<div class="mb-banner">
							<div>
								<h2 class="mb-title">The Maddybaba app lands in 2026.</h2>
								<p>Book, host and track your earnings from your phone.</p>
							</div>
							<form class="mb-waitlist">
								<input name="email" type="email" required placeholder="Your email" aria-label="Email address">
								<button class="mb-button mb-button--dark" type="submit">Notify me</button>
								<p class="mb-waitlist__message" role="status"></p>
							</form>
						</div>
					</div>
				</section>`;

			const form = this.querySelector('form');
			const message = this.querySelector('.mb-waitlist__message');

			form.addEventListener('submit', async (event) => {
				event.preventDefault();
				form.querySelector('button').disabled = true;

				try {
					const response = await liferayFetch('/o/c/appwaitlists', {
						body: JSON.stringify({email: form.elements.email.value.trim(), signedUpAt: new Date().toISOString(), source: 'web'}),
						headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
						method: 'POST',
					});

					if (response.ok) {
						form.reset();
						message.textContent = 'You’re on the list. We’ll email you when the app is out.';
					}
					else {
						// Duplicates come back in title; validation rule errors as a JSON list in detail.

						const {detail = '', title = ''} = await response.json().catch(() => ({}));
						let ruleMessage = '';

						try {
							ruleMessage = JSON.parse(detail)[0].errorMessage;
						}
						catch (error) {
							// Not a validation rule error.
						}

						message.textContent = /unique|already|duplicate/i.test(title) ? 'You’re already on the list.' : ruleMessage || title || 'That didn’t work. Please check the address and try again.';
					}
				}
				catch (error) {
					message.textContent = 'That didn’t work. Please try again.';
				}
				finally {
					form.querySelector('button').disabled = false;
				}
			});
		}
	}

	class MBSiteFooter extends MBElement {
		render() {
			const link = (page, params, label) => `<a href="${esc(pageURL(page, params))}">${label}</a>`;

			this.innerHTML = `
				<footer class="mb-footer">
					<div class="mb-wrap mb-footer__grid">
						<div>
							<a class="mb-brand" href="${esc(pageURL('home'))}"><span class="mb-brand__mark">mb</span> Maddybaba</a>
							<p>To make travel hosting as easy as sharing a link — and earning from it.</p>
							<blockquote>“The secret of getting ahead is <em>getting started</em>.”<cite>— Mark Twain</cite></blockquote>
						</div>
						<nav aria-label="Explore">
							<h2>Explore</h2>
							${link('search', {category: 'flight'}, 'Flights')}
							${link('search', {category: 'stay'}, 'Stays')}
							${link('search', {category: 'camping'}, 'Camping & treks')}
							${link('search', {category: 'paragliding'}, 'Paragliding')}
						</nav>
						<nav aria-label="Host">
							<h2>Host</h2>
							<a href="${esc(pageURL('home'))}#become-a-host">Become a host</a>
							<a href="${esc(pageURL('home'))}#become-a-host">Super Host</a>
							<a href="${esc(pageURL('home'))}#become-a-host">Partner hotels</a>
						</nav>
						<address>
							<h2>Contact</h2>
							<strong>Madhukar Kumar</strong>
							<a href="tel:+919061273844">+91 90612 73844</a>
							<a href="mailto:contactus@maddybaba.com">contactus@maddybaba.com</a>
							<span>#304, Mahadev Apartments<br>Dwarka Sector 23, New Delhi 110077</span>
						</address>
					</div>
				</footer>`;
		}
	}

	window.MB = {categoryLabel, esc, money, pageURL, searchURL};

	for (const [name, element] of Object.entries({
		'mb-app-waitlist': MBAppWaitlist,
		'mb-categories': MBCategories,
		'mb-hero-search': MBHeroSearch,
		'mb-host-profile': MBHostProfile,
		'mb-listing-detail': MBListingDetail,
		'mb-search-box': MBSearchBox,
		'mb-search-results': MBSearchResults,
		'mb-site-footer': MBSiteFooter,
		'mb-site-header': MBSiteHeader,
	})) {
		if (!customElements.get(name)) {
			customElements.define(name, element);
		}
	}
})();
