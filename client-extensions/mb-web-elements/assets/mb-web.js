/**
 * Maddybaba website custom elements (docs/website.md). Plain JS, no build step. Every element renders
 * into the light DOM so mb-web.css styles it. All client extensions of mb-web-elements load this file
 * (and the portal elements also mb-portal.js), so everything is defined once; window.MB holds the shared
 * helpers.
 *
 * Data: mb-search-service's public /search API (docs/search.md 8), whose address defaults to the local
 * service (another environment sets window.MBConfig = {searchURL: '…'}), and Liferay's headless APIs for
 * destinations and featured reviews (guests may read both).
 */
(function () {
	if (window.MB) {
		return;
	}

	// ---- Helpers ----------------------------------------------------------------------------------------

	const ICONS = {
		arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
		back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
		bed: '<path d="M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="1.5"/>',
		calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
		car: '<path d="M5 16h14v-4l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>',
		chat: '<path d="M4 5h16v11H9l-5 4z"/>',
		check: '<path d="M5 12l4 4 10-10"/>',
		compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
		food: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 8v10"/>',
		guide: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
		help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
		hotel: '<path d="M4 21V5h10v16M14 9h6v12M8 9h2M8 13h2M8 17h2"/>',
		map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
		menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
		pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
		shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
		spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
		star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.4l-5.5 3 1-6.3L3 9.7l6.2-.9z"/>',
		taxi: '<path d="M5 16h14v-4l-2-5H7l-2 5z"/><path d="M10 4h4v3h-4z"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/>',
		tour: '<path d="M4 20l5-12 4 7 3-4 4 9z"/><circle cx="17" cy="6" r="2"/>',
		user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
		users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M18 13a6 6 0 0 1 4 7"/>',
	};

	const SERVICE_ICONS = {
		activities: 'spark', camping: 'tour', completeTrip: 'map', experiences: 'spark', food: 'food', homestay: 'bed',
		localGuide: 'guide', paragliding: 'spark', photography: 'spark', rafting: 'spark', shikara: 'compass', stay: 'bed',
		tours: 'tour', transport: 'car', trekking: 'tour',
	};

	const PRICE_UNITS = {perGroup: 'per group', perNight: 'per night', perPerson: 'per person', perRoom: 'per room', perTrip: 'per trip'};

	const icon = (name) => `<svg class="mb-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

	const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

	function money(amount) {
		if (amount === null || amount === undefined || amount === '') {
			return '';
		}

		// Whole rupees without decimals (₹8,999); otherwise paise in full (₹1,799.80).

		const value = Number(amount);

		return '₹' + value.toLocaleString('en-IN', Number.isInteger(value) ? {maximumFractionDigits: 0} : {maximumFractionDigits: 2, minimumFractionDigits: 2});
	}

	// Hosts write descriptions; show them as text paragraphs, never as HTML.

	function paragraphs(html) {
		const text = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html').body.innerText || '';

		return text.split(/\n\s*\n|\n/).map((line) => line.trim()).filter(Boolean).map((line) => `<p>${esc(line)}</p>`).join('');
	}

	function hash(text) {
		let value = 0;

		for (const c of String(text || '')) {
			value = (value * 31 + c.charCodeAt(0)) >>> 0;
		}

		return value;
	}

	// The site's path (/web/maddybaba) when pages are served under it; '' on a virtual host.

	const SITE = (window.location.pathname.match(/^\/web\/[^/]+/) || [''])[0];
	const page = (path) => SITE + path;

	const params = () => Object.fromEntries(new URLSearchParams(window.location.search));

	const signedIn = () => Boolean(window.Liferay && window.Liferay.ThemeDisplay && window.Liferay.ThemeDisplay.isSignedIn());
	const signInURL = () => '/c/portal/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);

	function searchURL() {
		return ((window.MBConfig && window.MBConfig.searchURL) || 'http://localhost:58082').replace(/\/$/, '');
	}

	async function searchAPI(path) {
		const response = await fetch(searchURL() + path);

		if (!response.ok) {
			const error = new Error(response.status === 404 ? 'Not found' : `Search is unavailable (${response.status})`);

			error.status = response.status;

			throw error;
		}

		return response.json();
	}

	// Liferay's headless APIs as the signed-in user (or guest): Liferay.Util.fetch adds the session and
	// CSRF token. Errors carry Liferay's message, and validation rule messages when there are any.

	async function liferayAPI(path, {body, method = 'GET'} = {}) {
		const fetcher = (window.Liferay && window.Liferay.Util && window.Liferay.Util.fetch) || window.fetch.bind(window);
		const response = await fetcher(path, {
			body: body === undefined ? undefined : JSON.stringify(body),
			credentials: 'include',
			headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
			method,
		});
		const text = await response.text();
		const json = text ? (() => {
			try {
				return JSON.parse(text);
			}
			catch (error) {
				return {title: text};
			}
		})() : null;

		if (!response.ok) {
			throw apiError(response.status, json);
		}

		return json;
	}

	// Ops Admin (or Administrator): only they may add Hosts, so the Host collection offers them "create".
	// (my-user-account's roleBriefs only lists the roles the user may view, often just User.)

	async function isOps() {
		try {
			return Boolean((await liferayAPI('/o/c/hosts?pageSize=1&fields=id')).actions?.create);
		}
		catch (error) {
			return false;
		}
	}

	function apiError(status, json) {
		let messages = [];

		try {
			messages = JSON.parse(json?.detail || '[]').map((item) => item.errorMessage).filter(Boolean);
		}
		catch (error) {
			// detail isn't a list of rule messages
		}

		const error = new Error(messages.length ? messages.join(' ') : json?.title || json?.error || `Request failed (${status})`);

		error.status = status;
		error.messages = messages;

		return error;
	}

	// Flat landscape illustrations in the palette, so nothing needs image files (docs/website.md 1).

	const PALETTES = [
		{sky: '#f3e6d0', far: '#c9d6c3', mid: '#7f9c86', near: '#3f5f52', sun: '#f2a65a'},
		{sky: '#f6d6b8', far: '#e2b38c', mid: '#c27a4e', near: '#8e4a2a', sun: '#fbf6ec'},
		{sky: '#dfe7ef', far: '#b8c7d6', mid: '#7d93ad', near: '#14213d', sun: '#fbf6ec'},
		{sky: '#f7e9d2', far: '#f2c48f', mid: '#4f8a8b', near: '#14213d', sun: '#f2a65a'},
		{sky: '#e8efe6', far: '#a7c4a0', mid: '#5f8f5a', near: '#2f5d3a', sun: '#f2a65a'},
		{sky: '#f2dfd0', far: '#d8b8a6', mid: '#a86f5b', near: '#5a3a3a', sun: '#fbf6ec'},
	];

	function landscape(seed, {variant} = {}) {
		const n = hash(seed);
		const p = PALETTES[n % PALETTES.length];
		const kind = variant || ['peaks', 'hills', 'lake', 'city', 'coast'][n % 5];
		const sunX = 60 + (n % 180);
		let shapes = '';

		if (kind === 'city') {
			shapes = `<path d="M0 150h300v50H0z" fill="${p.near}"/><path d="M20 150v-50h30v-15h20v15h25v50zM120 150v-70l20-20 20 20v70zM180 150v-45h40v-20h20v65zM250 150v-35h40v35z" fill="${p.mid}"/>`;
		}
		else if (kind === 'lake') {
			shapes = `<path d="M0 120l60-50 50 35 60-55 70 60 60-35v40H0z" fill="${p.far}"/><path d="M0 140h300v60H0z" fill="${p.mid}"/><path d="M40 160h90M170 172h80M70 184h60" stroke="${p.sky}" stroke-width="3" opacity=".6"/>`;
		}
		else if (kind === 'coast') {
			shapes = `<path d="M0 130c40-20 90-25 140-10s110 10 160-5v85H0z" fill="${p.far}"/><path d="M0 155c50-15 100-10 150 0s100 5 150-5v50H0z" fill="${p.mid}"/><path d="M220 120c10-30 25-45 40-50-5 15-8 30-6 50z" fill="${p.near}"/>`;
		}
		else if (kind === 'hills') {
			shapes = `<path d="M0 120c50-40 100-40 150-10s100 20 150-10v100H0z" fill="${p.far}"/><path d="M0 150c60-30 120-25 180 0s90 10 120-5v55H0z" fill="${p.mid}"/><path d="M0 175c80-20 160-15 300 5v20H0z" fill="${p.near}"/>`;
		}
		else {
			shapes = `<path d="M0 130l55-60 40 35 55-75 55 70 40-30 55 55v75H0z" fill="${p.far}"/><path d="M150 30l-20 28 12-4 8 10 8-10 12 4z" fill="${p.sky}" opacity=".9"/><path d="M0 160l70-45 60 35 70-50 100 60v40H0z" fill="${p.mid}"/><path d="M0 185c90-25 200-25 300 0v15H0z" fill="${p.near}"/>`;
		}

		return `<svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="300" height="200" fill="${p.sky}"/><circle cx="${sunX}" cy="55" r="22" fill="${p.sun}"/>${shapes}</svg>`;
	}

	// A host without a photo: a portrait silhouette on a landscape, like the design's cards.

	function portrait(seed) {
		const n = hash(seed);
		const p = PALETTES[n % PALETTES.length];
		const skin = ['#8a5a3b', '#a8724f', '#6e4429', '#b98563'][n % 4];
		const hair = ['#2b1d16', '#3b2a20', '#1f1a17'][n % 3];

		return `<svg viewBox="0 0 300 225" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="300" height="225" fill="${p.sky}"/><circle cx="230" cy="50" r="22" fill="${p.sun}"/><path d="M0 170l60-50 50 30 60-55 70 55 60-30v105H0z" fill="${p.far}"/><path d="M80 225c0-45 30-70 70-70s70 25 70 70z" fill="${p.near}"/><circle cx="150" cy="105" r="40" fill="${skin}"/><path d="M110 100c0-30 18-45 40-45s40 15 40 45c-10-12-25-18-40-18s-30 6-40 18z" fill="${hair}"/></svg>`;
	}

	function photo(url, fallback) {
		return url ? `<img src="${esc(url)}" alt="" loading="lazy">` : fallback;
	}

	function stars(rating) {
		const full = Math.round(Number(rating) || 0);

		return `<span class="mb-stars" aria-label="${full} out of 5">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
	}

	// ---- Shared cards ------------------------------------------------------------------------------------

	function priceLine(price) {
		if (!price) {
			return '<div></div>';
		}

		return `<div><div class="mb-price-label">${price.label === 'completeTripsFrom' ? 'Complete trips from' : 'From'}</div><div class="mb-price">${money(price.amount)}</div></div>`;
	}

	function hostCard(host) {
		const rating = host.rating ? `<span class="mb-badge">★ ${esc(host.rating)} · ${esc(host.reviewCount)} review${host.reviewCount === 1 ? '' : 's'}</span>` : '<span></span>';
		const tags = (host.specialties || []).map((tag) => `<span class="mb-tag">${esc(tag.label)}</span>`).join('');

		return `
			<article class="mb-host-card">
				<div class="mb-host-photo">
					${photo(host.avatarUrl, portrait(host.handle))}
					<div class="mb-badges"><span class="mb-badge mb-badge-green">${icon('shield')} Verified Host</span>${rating}</div>
				</div>
				<div class="mb-host-body">
					<div class="mb-eyebrow">${esc(host.hostRole?.label || 'Local Host')}</div>
					<div class="mb-host-name">${esc(host.displayName)} — Your${esc((host.destinationName || '').replace(/\s+/g, ''))} Local</div>
					<div class="mb-host-place">${icon('pin')} ${esc([host.destinationName, host.stateName].filter(Boolean).join(', '))}</div>
					${host.quote ? `<p class="mb-host-quote">“${esc(host.quote)}”</p>` : ''}
					<div class="mb-host-tags">${tags}</div>
					${host.canArrangeEntireTrip ? `<div class="mb-whole-trip">${icon('check')} Can arrange your entire trip</div>` : ''}
					<div class="mb-host-foot">
						${priceLine(host.price)}
						<a class="mb-btn mb-btn-navy mb-btn-small" href="${page('/host')}?handle=${encodeURIComponent(host.handle)}">View Host</a>
					</div>
				</div>
			</article>`;
	}

	function listingCard(listing) {
		const unit = PRICE_UNITS[listing.price?.unit] || '';
		const rating = listing.rating ? ` · ★ ${esc(listing.rating)} (${esc(listing.reviewCount)})` : '';

		return `
			<a class="mb-listing-card" href="${page('/listing')}?slug=${encodeURIComponent(listing.slug)}">
				<div class="mb-art">${photo(listing.heroImageUrl, landscape(listing.slug))}</div>
				<div class="mb-listing-card-body">
					<div class="mb-eyebrow">${esc(listing.categoryLabel || listing.category)}${listing.durationText ? ` · ${esc(listing.durationText)}` : ''}</div>
					<h3>${esc(listing.title)}</h3>
					<div class="mb-host-place">${icon('pin')} ${esc(listing.destinationName)}${listing.host ? ` · Hosted by ${esc(listing.host.displayName)}` : ''}${rating}</div>
					<p class="mb-muted">${esc(listing.shortDescription)}</p>
					<div class="mb-host-foot"><div><div class="mb-price-label">From</div><div class="mb-price">${money(listing.price?.amount)} <small class="mb-muted">${esc(unit)}</small></div></div><span class="mb-link">View ${icon('arrow')}</span></div>
				</div>
			</a>`;
	}

	// The search bar of the hero and the results pages: where, start, end, guests → /hosts.

	function searchBar(values = {}, buttonLabel = 'Find Local Hosts') {
		return `
			<form class="mb-searchbar" role="search">
				<label class="mb-field"><span>Where are you going?</span><input class="mb-input" name="q" autocomplete="off" placeholder="Search destination" value="${esc(values.q)}"><ul class="mb-suggest" hidden></ul></label>
				<label class="mb-field"><span>Start date</span><input class="mb-input" type="date" name="from" value="${esc(values.from)}"></label>
				<label class="mb-field"><span>End date</span><input class="mb-input" type="date" name="to" value="${esc(values.to)}"></label>
				<label class="mb-field"><span>Guests</span><input class="mb-input" type="number" min="1" max="20" name="guests" placeholder="2 Guests" value="${esc(values.guests)}"></label>
				<button class="mb-btn" type="submit">${icon('search')} ${esc(buttonLabel)}</button>
			</form>`;
	}

	function wireSearchBar(root, target = '/hosts') {
		const form = root.querySelector('form.mb-searchbar');
		const input = form.querySelector('input[name="q"]');
		const list = form.querySelector('.mb-suggest');
		let timer;

		form.addEventListener('submit', (event) => {
			event.preventDefault();

			const query = new URLSearchParams();

			for (const [name, value] of new FormData(form)) {
				if (String(value).trim()) {
					query.set(name, String(value).trim());
				}
			}

			window.location.href = page(target) + (query.toString() ? `?${query}` : '');
		});

		input.addEventListener('input', () => {
			clearTimeout(timer);
			timer = setTimeout(async () => {
				if (input.value.trim().length < 2) {
					list.hidden = true;

					return;
				}

				try {
					const {items} = await searchAPI(`/search/suggest?q=${encodeURIComponent(input.value)}`);

					list.innerHTML = items.map((item) => `<li data-text="${esc(item.text)}">${item.type === 'destination' ? icon('pin') : icon('search')} ${esc(item.text)}</li>`).join('');
					list.hidden = !items.length;
				}
				catch (error) {
					list.hidden = true;
				}
			}, 200);
		});

		list.addEventListener('mousedown', (event) => {
			const item = event.target.closest('li');

			if (item) {
				input.value = item.dataset.text;
				list.hidden = true;
			}
		});

		input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 150));
	}

	function failure(error) {
		return `<div class="mb-empty">${esc(error.status === 404 ? 'We couldn’t find that page.' : error.message)}</div>`;
	}

	// ---- Elements ----------------------------------------------------------------------------------------

	const ELEMENTS = {};

	function define(name, render) {
		ELEMENTS[name] = render;

		if (!customElements.get(name)) {
			customElements.define(
				name,
				class extends HTMLElement {
					connectedCallback() {
						if (this._rendered) {
							return;
						}

						this._rendered = true;
						this.classList.add('mb');
						Promise.resolve(render(this)).catch((error) => {
							console.error(`[MB] ${name}`, error);
							this.innerHTML = failure(error);
						});
					}
				}
			);
		}
	}

	const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#c2531b"/><path d="M5 22l7-9 4 5 3-4 8 8z" fill="#fbf6ec"/><circle cx="21" cy="10" r="3" fill="#f2a65a"/></svg>';

	define('mb-site-header', async (element) => {
		const current = window.location.pathname;
		const links = [
			['Destinations', page('/home') + '#destinations'],
			['Local Hosts', page('/hosts')],
			['Complete Trips', page('/trips')],
		];

		element.innerHTML = `
			<header class="mb-header">
				<div class="mb-wrap">
					<a class="mb-logo" href="${page('/home')}">${LOGO} MaddyBaba</a>
					<button class="mb-menu-toggle" aria-label="Menu" aria-expanded="false">${icon('menu')}</button>
					<nav class="mb-nav">${links.map(([label, href]) => `<a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
					<div class="mb-header-actions">
						<a class="mb-btn mb-btn-small" href="${page('/become-a-host')}">Become a Host</a>
						<span class="mb-account">${signedIn() ? '' : `<a class="mb-btn mb-btn-light mb-btn-small" href="${signInURL()}">Log in</a>`}</span>
					</div>
				</div>
			</header>`;

		const header = element.querySelector('.mb-header');
		const toggle = element.querySelector('.mb-menu-toggle');

		toggle.addEventListener('click', () => {
			toggle.setAttribute('aria-expanded', String(header.classList.toggle('mb-open')));
		});

		if (!signedIn()) {
			return;
		}

		const me = await liferayAPI('/o/headless-admin-user/v1.0/my-user-account');
		const ops = await isOps();
		const isHost = (me.accountBriefs || []).length > 0;
		const menu = [
			isHost && ['Host Dashboard', page('/host-dashboard')],
			ops && ['Ops Dashboard', page('/ops')],
			!isHost && ['Become a Host', page('/become-a-host')],
			['Sign out', '/c/portal/logout'],
		].filter(Boolean);

		const account = element.querySelector('.mb-account');

		account.innerHTML = `
			<span class="mb-user">
				<button class="mb-btn mb-btn-light mb-btn-small" aria-haspopup="true">${icon('user')} ${esc(me.givenName || me.name)}</button>
				<span class="mb-user-menu">${menu.map(([label, href]) => `<a href="${href}">${label}</a>`).join('')}</span>
			</span>`;

		const button = account.querySelector('button');
		const dropdown = account.querySelector('.mb-user-menu');

		button.addEventListener('click', () => dropdown.classList.toggle('mb-open'));
		document.addEventListener('click', (event) => {
			if (!account.contains(event.target)) {
				dropdown.classList.remove('mb-open');
			}
		});
	});

	define('mb-hero', (element) => {
		element.innerHTML = `
			<section class="mb-hero mb-on-dark">
				<svg class="mb-hero-art" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
					<circle cx="1180" cy="150" r="70" fill="#f2a65a"/>
					<path d="M0 520l180-150 140 90 200-190 180 160 160-110 200 140 180-120 200 130v170H0z" fill="#1e2f52"/>
					<path d="M0 580l220-110 180 80 240-140 220 130 200-90 360 130v80H0z" fill="#253a63"/>
				</svg>
				<div class="mb-wrap">
					<span class="mb-pill">${icon('user')} Meet your local Baba</span>
					<h1>Your Local Host.<br><em>Your Whole Trip.</em></h1>
					<p class="mb-lead">Don't book everything separately. Find a local who can take care of your trip.</p>
					${searchBar(params())}
				</div>
			</section>`;

		wireSearchBar(element);
	});

	define('mb-host-carousel', async (element) => {
		element.innerHTML = `
			<section class="mb-band mb-band-cream">
				<div class="mb-wrap">
					<div class="mb-section-head">
						<div><h2>Meet Your Local Hosts</h2><p class="mb-lead">Real people who know the destination and can help you experience it like a local.</p></div>
						<div class="mb-arrows"><button class="mb-arrow" data-dir="-1" aria-label="Previous">${icon('back')}</button><button class="mb-arrow mb-arrow-dark" data-dir="1" aria-label="Next">${icon('arrow')}</button></div>
					</div>
					<div class="mb-carousel"><div class="mb-loading">Finding hosts…</div></div>
					<p style="margin-top:24px"><a class="mb-link" href="${page('/hosts')}">Explore All Hosts ${icon('arrow')}</a></p>
				</div>
			</section>`;

		const track = element.querySelector('.mb-carousel');

		element.querySelectorAll('.mb-arrow').forEach((button) =>
			button.addEventListener('click', () => track.scrollBy({left: Number(button.dataset.dir) * (track.clientWidth * 0.8), behavior: 'smooth'}))
		);

		try {
			const {items} = await searchAPI('/search/hosts?sort=rating&pageSize=8');

			track.innerHTML = items.length ? items.map(hostCard).join('') : '<div class="mb-empty">Hosts are on their way.</div>';
		}
		catch (error) {
			track.innerHTML = failure(error);
		}
	});

	define('mb-destination-tiles', async (element) => {
		element.innerHTML = `
			<section class="mb-band mb-band-sand" id="destinations">
				<div class="mb-wrap">
					<div class="mb-section-head"><h2>Where Do You Want To Go?</h2><span class="mb-muted">Destination · Dates · Available Hosts</span></div>
					<div class="mb-tiles"><div class="mb-loading">Loading destinations…</div></div>
				</div>
			</section>`;

		const tiles = element.querySelector('.mb-tiles');
		const {items} = await liferayAPI('/o/c/destinations?sort=sortOrder:asc&pageSize=12&fields=name,slug,hostCount,heroImage');

		tiles.innerHTML = items.map((destination) => `
			<a class="mb-tile" href="${page('/hosts')}?destination=${encodeURIComponent(destination.slug)}">
				${photo(destination.heroImage?.link?.href, landscape(destination.slug))}
				<span class="mb-tile-label"><span><strong>${esc(destination.name)}</strong><small>${Number(destination.hostCount) || 0} Host${Number(destination.hostCount) === 1 ? '' : 's'}</small></span><span class="mb-arrow">${icon('arrow')}</span></span>
			</a>`).join('');
	});

	define('mb-difference', (element) => {
		const separate = [['hotel', 'Hotel'], ['taxi', 'Taxi'], ['food', 'Restaurant'], ['tour', 'Tour'], ['spark', 'Activities'], ['guide', 'Guide']];
		const services = [['bed', 'Stay'], ['car', 'Transport'], ['food', 'Food'], ['tour', 'Tours'], ['spark', 'Activities'], ['map', 'Itinerary'], ['help', 'Local Help']];

		element.innerHTML = `
			<section class="mb-band mb-band-navy mb-on-dark">
				<div class="mb-wrap" style="text-align:center">
					<div class="mb-eyebrow">The MaddyBaba Difference</div>
					<h2 style="margin-top:10px">One Local. <em>Your Whole Trip.</em></h2>
					<div class="mb-diff" style="text-align:left">
						<div class="mb-diff-box">
							<h3>Booking Everything Separately</h3>
							<p class="mb-lead" style="font-size:14px">Six searches. Six contacts. Six payments.</p>
							<div class="mb-diff-steps">${separate.map(([name, label], i) => `<span class="mb-diff-step" style="margin-left:${(i % 2) * 28}px">${icon(name)} ${label}</span>`).join('')}</div>
						</div>
						<div class="mb-diff-with">
							<strong>With MaddyBaba</strong>
							<span class="mb-diff-you">YOU</span>
							<div class="mb-diff-host">${icon('user')}<div><div class="mb-eyebrow">Your Local Host</div><strong>One person. One chat. One booking.</strong></div></div>
							<div class="mb-diff-services">${services.map(([name, label]) => `<span class="mb-diff-service">${icon(name)} ${label}</span>`).join('')}<a class="mb-btn mb-btn-small" href="${page('/hosts')}">Find My Host</a></div>
							<p class="mb-diff-note">Your host doesn't just sell you a service. Your host takes care of your trip.</p>
						</div>
					</div>
				</div>
			</section>`;
	});

	define('mb-become-host-band', (element) => {
		const ways = ['Offering your own services', 'Connecting guests with local services', 'Guiding travelers', 'Planning complete trips', 'Managing everything for a guest'];

		element.innerHTML = `
			<section class="mb-band mb-band-cream">
				<div class="mb-wrap mb-become">
					<div>
						<div class="mb-eyebrow">Know your place better than anyone?</div>
						<h2 style="margin-top:10px">Become a MaddyBaba Host.</h2>
						<p class="mb-lead">You don't need to own a hotel or a taxi. You can earn by:</p>
						<div class="mb-ways">${ways.map((way) => `<div class="mb-way"><span class="mb-tick">${icon('check')}</span>${way}</div>`).join('')}</div>
					</div>
					<div class="mb-become-card">
						<h3>Turn Your Local Knowledge Into An Experience.</h3>
						<p><a class="mb-btn mb-btn-light" href="${page('/become-a-host')}">Become a Host</a></p>
						<p>No hotel? No vehicle? No problem. If you know the place and can help travelers, you can become a host.</p>
					</div>
				</div>
			</section>`;
	});

	define('mb-testimonials', async (element) => {
		element.innerHTML = `
			<section class="mb-band mb-band-sand">
				<div class="mb-wrap">
					<div class="mb-section-head"><h2>What Travelers Say</h2></div>
					<div class="mb-quotes"><div class="mb-loading">Loading…</div></div>
				</div>
			</section>`;

		const box = element.querySelector('.mb-quotes');
		const filter = encodeURIComponent('isFeatured eq true and isPublished eq true');
		const {items} = await liferayAPI(`/o/c/reviews?filter=${filter}&sort=dateCreated:asc&pageSize=3`);

		box.innerHTML = items.length ? items.map((review, i) => `
			<figure class="mb-quote${i === 0 ? ' mb-quote-featured' : ''}">
				${stars(review.rating)}
				<blockquote>“${esc(review.comment)}”</blockquote>
				<figcaption class="mb-quote-who"><strong>${esc(review.reviewerName)}</strong><span class="mb-muted">${esc(review.reviewerCity)} → ${esc(review.destinationName)} · Hosted by ${esc(review.hostDisplayName)}</span></figcaption>
			</figure>`).join('') : '<div class="mb-empty">Stories from travelers will appear here.</div>';
	});

	define('mb-journal', (element) => {
		const topics = [['Hidden places', 'lake'], ['Weekend trips', 'hills'], ['Local food', 'city'], ['Trekking', 'peaks'], ['Road trips', 'coast'], ['Local experiences', 'city']];

		element.innerHTML = `
			<section class="mb-band mb-band-cream">
				<div class="mb-wrap">
					<div class="mb-section-head"><h2>Discover Somewhere New</h2><a class="mb-link" href="#" data-soon>Read the journal ${icon('arrow')}</a></div>
					<div class="mb-journal">${topics.map(([topic, variant]) => `<a class="mb-journal-tile" href="#" title="Travel Journal: coming soon">${landscape(topic, {variant})}<span>${topic}</span></a>`).join('')}</div>
				</div>
			</section>`;
	});

	define('mb-closing-cta', (element) => {
		element.innerHTML = `
			<section class="mb-closing mb-on-dark">
				<svg class="mb-hero-art" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
					<circle cx="300" cy="90" r="80" fill="#f2a65a"/>
					<path d="M0 360l200-120 160 80 220-170 200 150 180-90 220 110 260-120v320H0z" fill="#8e3b16"/>
					<path d="M0 430l260-90 200 70 240-110 260 100 240-60 240 80v120H0z" fill="#6f2e12"/>
				</svg>
				<div class="mb-wrap">
					<h2>Where Are You Going Next?</h2>
					<p class="mb-lead">Find someone local who can make your trip easier.</p>
					<div class="mb-closing-actions"><a class="mb-btn mb-btn-light" href="${page('/hosts')}">Find My Local Host</a><a class="mb-btn mb-btn-outline" href="${page('/become-a-host')}">Become a Host</a></div>
				</div>
			</section>`;
	});

	define('mb-site-footer', async (element) => {
		const soon = (label) => [label, '#', true];
		const columns = [
			['Explore', [['Home', page('/home')], ['Explore Destinations', page('/home') + '#destinations'], ['Find Local Hosts', page('/hosts')], ['Complete Trips', page('/trips')], soon('Trip Packages'), soon('Plan My Trip'), soon('Travel Journal')]],
			['Destinations', []],
			['For Guests', [soon('My Trips'), soon('My Bookings'), soon('Messages'), soon('Saved Hosts'), soon('Profile'), ['Login / Register', signInURL()]]],
			['For Hosts', [['Become a Host', page('/become-a-host')], ['Host Dashboard', page('/host-dashboard')], ['My Services', page('/host-dashboard') + '#services'], soon('Packages'), ['Availability', page('/host-dashboard') + '#availability'], ['Earnings', page('/host-dashboard') + '#earnings'], ['Reviews', page('/host-dashboard') + '#reviews']]],
			['MaddyBaba', [soon('About MaddyBaba'), soon('Trust & Safety'), soon('Help Centre'), soon('Contact Us')]],
		];

		const render = () => {
			element.innerHTML = `
				<footer class="mb-footer">
					<div class="mb-wrap">
						<div class="mb-footer-top">
							<div><a class="mb-logo" href="${page('/home')}">${LOGO} MaddyBaba</a><p style="margin-top:8px">You travel. Your Baba handles the rest.</p></div>
							<div class="mb-closing-actions" style="margin:0"><a class="mb-btn mb-btn-small" href="${page('/hosts')}">Find Local Hosts</a><a class="mb-btn mb-btn-outline mb-btn-small" style="color:#fff!important" href="${page('/become-a-host')}">Become a Host</a></div>
						</div>
						<div class="mb-sitemap">${columns.map(([title, links]) => `<div><h4>${title}</h4><ul>${links.map(([label, href, isSoon]) => `<li><a href="${href}"${isSoon ? ' data-soon' : ''}>${esc(label)}</a></li>`).join('')}</ul></div>`).join('')}</div>
						<div class="mb-footer-bottom"><span>© ${new Date().getFullYear()} MaddyBaba.com</span><nav><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Cancellation Policy</a><a href="#">Sitemap</a></nav></div>
					</div>
				</footer>`;
		};

		render();

		try {
			const {items} = await liferayAPI('/o/c/destinations?sort=sortOrder:asc&pageSize=8&fields=name,slug');

			columns[1][1] = items.map((destination) => [destination.name, `${page('/hosts')}?destination=${encodeURIComponent(destination.slug)}`]);
			render();
		}
		catch (error) {
			// The footer works without the destination list.
		}
	});

	define('mb-host-results', async (element) => {
		const query = params();

		element.innerHTML = `
			<section class="mb-page-head mb-on-dark"><div class="mb-wrap"><div class="mb-eyebrow">Local Hosts</div><h1>Find your <em>local Baba</em></h1>${searchBar(query)}</div></section>
			<section class="mb-band mb-band-cream" style="padding-top:0"><div class="mb-wrap mb-results">
				<div class="mb-filters">
					<select class="mb-input" name="destination"><option value="">All destinations</option></select>
					<select class="mb-input" name="category"><option value="">Any service</option></select>
					<label class="mb-check"><input type="checkbox" name="fullTrip"${query.fullTrip === 'true' ? ' checked' : ''}> Can arrange the whole trip</label>
					<select class="mb-input" name="sort">${[['relevance', 'Best match'], ['rating', 'Top rated'], ['priceAsc', 'Price: low to high']].map(([value, label]) => `<option value="${value}"${query.sort === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
					<span class="mb-count"></span>
				</div>
				<div class="mb-host-grid"><div class="mb-loading">Finding hosts…</div></div>
				<div class="mb-pager"></div>
			</div></section>`;

		wireSearchBar(element);

		const grid = element.querySelector('.mb-host-grid');
		const filters = element.querySelector('.mb-filters');

		const go = (changes) => {
			const next = new URLSearchParams({...params(), ...changes});

			for (const [name, value] of [...next]) {
				if (!value || value === 'false') {
					next.delete(name);
				}
			}

			if (!('page' in changes)) {
				next.delete('page');
			}

			window.location.search = next.toString();
		};

		filters.addEventListener('change', (event) => {
			const {name, type, checked, value} = event.target;

			go({[name]: type === 'checkbox' ? String(checked) : value});
		});

		try {
			const [destinations, result] = await Promise.all([
				liferayAPI('/o/c/destinations?sort=sortOrder:asc&pageSize=50&fields=name,slug'),
				searchAPI('/search/hosts?' + new URLSearchParams({...query, pageSize: '12'})),
			]);

			filters.querySelector('[name="destination"]').innerHTML += destinations.items.map((destination) => `<option value="${esc(destination.slug)}"${query.destination === destination.slug ? ' selected' : ''}>${esc(destination.name)}</option>`).join('');

			const specialties = new Map(result.facets.specialties.map((facet) => [facet.key, facet.label]));

			if (query.category && !specialties.has(query.category)) {
				specialties.set(query.category, query.category);
			}

			filters.querySelector('[name="category"]').innerHTML += [...specialties].map(([key, label]) => `<option value="${esc(key)}"${query.category === key ? ' selected' : ''}>${esc(label)}</option>`).join('');
			filters.querySelector('.mb-count').textContent = `${result.totalCount} host${result.totalCount === 1 ? '' : 's'}`;

			grid.innerHTML = result.items.length ? result.items.map(hostCard).join('') : '<div class="mb-empty">No hosts match yet. Try other dates or fewer filters.</div>';

			const pages = Math.ceil(result.totalCount / result.pageSize);

			if (pages > 1) {
				const pager = element.querySelector('.mb-pager');

				pager.innerHTML = `<button class="mb-btn mb-btn-outline mb-btn-small" ${result.page <= 1 ? 'disabled' : ''} data-page="${result.page - 1}">Previous</button><span>Page ${result.page} of ${pages}</span><button class="mb-btn mb-btn-outline mb-btn-small" ${result.page >= pages ? 'disabled' : ''} data-page="${result.page + 1}">Next</button>`;
				pager.addEventListener('click', (event) => event.target.dataset.page && go({page: event.target.dataset.page}));
			}
		}
		catch (error) {
			grid.innerHTML = failure(error);
		}
	});

	define('mb-host-profile', async (element) => {
		const {handle} = params();

		if (!handle) {
			element.innerHTML = `<div class="mb-wrap mb-band">${failure({status: 404})}</div>`;

			return;
		}

		element.innerHTML = '<div class="mb-wrap mb-band"><div class="mb-loading">Loading host…</div></div>';

		const host = await searchAPI(`/search/hosts/${encodeURIComponent(handle)}`);

		element.innerHTML = `
			<section class="mb-page-head mb-on-dark" style="padding-bottom:110px"><div class="mb-wrap"><a class="mb-link" style="color:#f2a65a!important" href="${page('/hosts')}">${icon('back')} All hosts</a><h1 style="margin-top:14px">${esc(host.displayName)} — <em>Your${esc((host.destinationName || '').replace(/\s+/g, ''))} Local</em></h1></div></section>
			<section class="mb-band mb-band-cream" style="padding-top:0"><div class="mb-wrap mb-profile">
				<div class="mb-profile-card">${hostCard(host).replace(/<a class="mb-btn[^>]*>View Host<\/a>/, `<a class="mb-btn mb-btn-small" href="#listings">See trips</a>`)}</div>
				<div class="mb-profile-main">
					<section><h2>About ${esc(host.displayName)}</h2>${paragraphs(host.bio) || '<p class="mb-muted">This host hasn’t written a bio yet.</p>'}</section>
					<section id="listings"><h2>Trips and services</h2><div class="mb-listing-grid">${host.listings.length ? host.listings.map(listingCard).join('') : '<div class="mb-empty">No trips listed yet.</div>'}</div></section>
					<section><h2>Reviews</h2>${host.reviews.length ? host.reviews.map((review) => `<div class="mb-review">${stars(review.rating)} <strong>${esc(review.reviewerName)}</strong> <span class="mb-muted">· ${esc(review.reviewerCity)} · ${esc(review.date)}</span><p style="margin-top:6px">${esc(review.comment)}</p></div>`).join('') : '<p class="mb-muted">No reviews yet.</p>'}</section>
				</div>
			</div></section>`;
	});

	define('mb-trip-results', async (element) => {
		const query = params();

		element.innerHTML = `
			<section class="mb-page-head mb-on-dark"><div class="mb-wrap"><div class="mb-eyebrow">Complete Trips</div><h1>One booking. <em>Your whole trip.</em></h1><p class="mb-lead">Packaged trips planned and run by local hosts: stay, transport, food and sightseeing included.</p>${searchBar(query, 'Find Trips')}</div></section>
			<section class="mb-band mb-band-cream" style="padding-top:0"><div class="mb-wrap mb-results">
				<div class="mb-filters"><select class="mb-input" name="sort">${[['relevance', 'Best match'], ['priceAsc', 'Price: low to high'], ['priceDesc', 'Price: high to low'], ['rating', 'Top rated']].map(([value, label]) => `<option value="${value}"${query.sort === value ? ' selected' : ''}>${label}</option>`).join('')}</select><span class="mb-count"></span></div>
				<div class="mb-listing-grid"><div class="mb-loading">Finding trips…</div></div>
			</div></section>`;

		wireSearchBar(element, '/trips');

		element.querySelector('[name="sort"]').addEventListener('change', (event) => {
			window.location.search = new URLSearchParams({...params(), sort: event.target.value}).toString();
		});

		const grid = element.querySelector('.mb-listing-grid');

		try {
			const result = await searchAPI('/search/trips?' + new URLSearchParams({...query, category: 'completeTrip', pageSize: '24'}));

			element.querySelector('.mb-count').textContent = `${result.totalCount} trip${result.totalCount === 1 ? '' : 's'}`;
			grid.innerHTML = result.items.length ? result.items.map(listingCard).join('') : '<div class="mb-empty">No complete trips match. Try other dates.</div>';
		}
		catch (error) {
			grid.innerHTML = failure(error);
		}
	});

	define('mb-listing-detail', async (element) => {
		const {slug} = params();

		if (!slug) {
			element.innerHTML = `<div class="mb-wrap mb-band">${failure({status: 404})}</div>`;

			return;
		}

		element.innerHTML = '<div class="mb-wrap mb-band"><div class="mb-loading">Loading…</div></div>';

		const listing = await searchAPI(`/search/listings/${encodeURIComponent(slug)}`);
		const unit = PRICE_UNITS[listing.price?.unit] || '';
		const included = listing.inclusions.filter((inclusion) => inclusion.inclusionType !== 'addOn');
		const addOns = listing.inclusions.filter((inclusion) => inclusion.inclusionType === 'addOn');

		element.innerHTML = `
			<section class="mb-band mb-band-cream" style="padding-top:36px"><div class="mb-wrap">
				${listing.host ? `<a class="mb-link" href="${page('/host')}?handle=${encodeURIComponent(listing.host.handle)}">${icon('back')} ${esc(listing.host.displayName)}'s trips</a>` : ''}
				<div class="mb-eyebrow" style="margin-top:18px">${esc(listing.categoryLabel || listing.category)}${listing.durationText ? ` · ${esc(listing.durationText)}` : ''}</div>
				<h1 style="font-size:clamp(32px,4.5vw,50px);margin-top:8px">${esc(listing.title)}</h1>
				<p class="mb-muted" style="margin-top:8px">${icon('pin')} ${esc([listing.destinationName, listing.stateName].filter(Boolean).join(', '))}${listing.rating ? ` · ★ ${esc(listing.rating)} (${esc(listing.reviewCount)} review${listing.reviewCount === 1 ? '' : 's'})` : ''}</p>
				<div class="mb-detail">
					<div class="mb-detail-body">
						<div class="mb-detail-art">${photo(listing.heroImageUrl, landscape(listing.slug))}</div>
						<div>${paragraphs(listing.description)}</div>
						${included.length ? `<div><h3>What's included</h3><ul class="mb-includes">${included.map((inclusion) => `<li><span>${icon('check')} ${esc(inclusion.label)}</span></li>`).join('')}</ul></div>` : ''}
						${addOns.length ? `<div><h3>Add-ons</h3><ul class="mb-includes">${addOns.map((inclusion) => `<li><span>${icon('spark')} ${esc(inclusion.label)}</span><strong>${money(inclusion.addOnPrice)}</strong></li>`).join('')}</ul></div>` : ''}
					</div>
					<aside class="mb-side">
						<div><div class="mb-price-label">From</div><div class="mb-price" style="font-size:30px">${money(listing.price?.amount)} <small class="mb-muted" style="font-size:14px">${esc(unit)}</small></div></div>
						<div><strong>Open dates</strong><div class="mb-dates" style="margin-top:10px">${listing.slots.slice(0, 9).map((slot) => `<div class="mb-date"><strong>${new Date(slot.date + 'T00:00:00').toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}</strong>${slot.placesLeft} left</div>`).join('') || '<span class="mb-muted">No open dates in the next 30 days.</span>'}</div></div>
						${listing.host ? `<a class="mb-btn" href="${page('/host')}?handle=${encodeURIComponent(listing.host.handle)}">${icon('chat')} Contact ${esc(listing.host.displayName)}</a>` : ''}
						<p class="mb-hint">Online booking and payment are coming soon. Your host will confirm dates and the final price with you.</p>
					</aside>
				</div>
			</div></section>`;
	});

	window.MB = {esc, hostCard, icon, isOps, landscape, liferayAPI, listingCard, money, page, paragraphs, portrait, searchAPI, signInURL, signedIn, PRICE_UNITS, SERVICE_ICONS, apiError, define};
})();
