/**
 * Maddybaba portal elements (docs/website.md sections 4–6): host sign-up, host dashboard and Ops
 * dashboard. Loaded after mb-web.js, whose helpers (window.MB) they use.
 *
 * Data: Liferay's headless APIs as the signed-in user (account roles decide what a host sees; Ops Admin
 * sees everything). Sign-up and profile edits are HostApplication entries the user creates and owns;
 * mb-actions-service applies them to the user's Host (hosts only have View on Host).
 */
(function () {
	if (!window.MB || window.MB.portal) {
		return;
	}

	const {define, esc, icon, liferayAPI, money, page, signInURL, signedIn} = window.MB;

	const SERVICES = [
		['completeTrip', 'Complete Trip'], ['stay', 'Stay'], ['homestay', 'Homestay'], ['transport', 'Transport'], ['food', 'Local Food'],
		['tours', 'Tours'], ['activities', 'Activities'], ['experiences', 'Experiences'], ['trekking', 'Trekking'], ['camping', 'Camping'],
		['rafting', 'Rafting'], ['paragliding', 'Paragliding'], ['shikara', 'Shikara'], ['photography', 'Photography'], ['localGuide', 'Local Guide'],
	];
	const ROLES = [['localTripHost', 'Local Trip Host'], ['experienceHost', 'Local Experience Host'], ['adventureHost', 'Adventure Host']];
	const OFFERS = [
		['ownServices', 'Offering your own services'], ['connectServices', 'Connecting guests with local services'], ['guiding', 'Guiding travelers'],
		['planTrips', 'Planning complete trips'], ['fullTrip', 'Managing everything for a guest'],
	];
	const PRICE_UNITS = [['perPerson', 'Per person'], ['perNight', 'Per night'], ['perRoom', 'Per room'], ['perGroup', 'Per group'], ['perTrip', 'Per trip']];
	const USERS = '/o/headless-admin-user/v1.0';
	const WORKFLOW = '/o/headless-admin-workflow/v1.0/workflow-tasks';

	// ---- Helpers ----------------------------------------------------------------------------------------

	// Submits a HostApplication (docs/website.md 4) and waits until mb-actions-service has applied or
	// rejected it; throws with the reason when rejected. Validation rules on the application itself
	// (phone, booking link, quote) reject it straight away.

	async function submitApplication(type, profile) {
		const {destinationId, hostOffers, specialties, ...fields} = profile;
		const application = await liferayAPI('/o/c/hostapplications', {
			body: {
				...fields,
				applicationType: type,
				...(hostOffers && {hostOffers}),
				...(specialties && {specialties}),
				...(destinationId && {r_destinationHostApplications_c_destinationId: Number(destinationId)}),
			},
			method: 'POST',
		});

		for (let attempt = 0; attempt < 40; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 1500));

			const current = await liferayAPI(`/o/c/hostapplications/${application.id}`);
			const status = current.applicationStatus?.key;

			if (status === 'applied') {
				return current;
			}

			if (status === 'rejected') {
				throw new Error(current.resultMessage || 'Your application was not accepted.');
			}
		}

		throw new Error('This is taking longer than usual. We have your application; check back in a few minutes.');
	}

	// The user's host state: their Host once approved (account role View), else their latest sign-up
	// application (they own it).

	async function hostState(user) {
		const hosts = await all(`/o/c/hosts?filter=${encodeURIComponent(`r_userHost_userId eq '${user.id}'`)}`);

		if (hosts.length && (user.accountBriefs || []).length) {
			return {host: hosts[0], state: 'active'};
		}

		const signUps = (await all('/o/c/hostapplications?sort=dateCreated:desc')).filter((application) => application.applicationType?.key === 'signUp');
		const latest = signUps.find((application) => application.applicationStatus?.key !== 'rejected');

		return latest ? {application: latest, state: 'inReview'} : {rejected: signUps[0], state: 'none'};
	}

	const all = async (path) => (await liferayAPI(path + (path.includes('?') ? '&' : '?') + 'pageSize=500')).items;

	const key = (value) => (value && typeof value === 'object' ? value.key : value) || '';
	const label = (value) => (value && typeof value === 'object' ? value.name : value) || '';
	const date = (value) => (value ? new Date(value.length === 10 ? value + 'T00:00:00' : value).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}) : '');
	const today = () => new Date().toISOString().slice(0, 10);

	function options(list, selected) {
		return list.map(([value, text]) => `<option value="${esc(value)}"${String(selected) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('');
	}

	function checks(name, list, selected = []) {
		return list.map(([value, text]) => `<label class="mb-check"><input type="checkbox" name="${name}" value="${esc(value)}"${selected.includes(value) ? ' checked' : ''}> ${esc(text)}</label>`).join('');
	}

	function statusChip(entry) {
		const code = entry.status?.code;

		return code === 0 ? '<span class="mb-status mb-status-ok">Live</span>' : code === 1 ? '<span class="mb-status mb-status-wait">In review</span>' : `<span class="mb-status mb-status-bad">${esc(entry.status?.label || 'Draft')}</span>`;
	}

	function pill(text, kind = 'ok') {
		return `<span class="mb-status mb-status-${kind}">${esc(text)}</span>`;
	}

	function table(headers, rows, empty = 'Nothing here yet.') {
		if (!rows.length) {
			return `<div class="mb-empty">${esc(empty)}</div>`;
		}

		return `<div class="mb-table-wrap"><table class="mb-table"><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
	}

	function stat(labelText, value) {
		return `<div class="mb-stat"><small>${esc(labelText)}</small><strong>${value}</strong></div>`;
	}

	// A modal form; resolves with the form's values (FormData) on submit, or null when cancelled.

	function dialog(title, body, submitLabel = 'Save') {
		return new Promise((resolve) => {
			const box = document.createElement('div');

			box.className = 'mb mb-dialog';
			box.innerHTML = `<div role="dialog" aria-modal="true"><h3>${esc(title)}</h3><form>${body}<p class="mb-error" hidden></p><div class="mb-form-actions"><button class="mb-btn mb-btn-outline" type="button" data-cancel>Cancel</button><button class="mb-btn" type="submit">${esc(submitLabel)}</button></div></form></div>`;
			document.body.appendChild(box);

			const form = box.querySelector('form');

			box.showError = (message) => {
				const error = box.querySelector('.mb-error');

				error.textContent = message;
				error.hidden = !message;
			};
			box.close = () => box.remove();
			box.querySelector('[data-cancel]').addEventListener('click', () => {
				box.remove();
				resolve(null);
			});
			form.addEventListener('submit', (event) => {
				event.preventDefault();
				resolve({box, data: new FormData(form), form});
			});
		});
	}

	// Runs save(values) for a dialog until it succeeds or is cancelled; shows errors in the dialog.

	async function edit(title, body, save, submitLabel) {
		let result = await dialog(title, body, submitLabel);

		while (result) {
			const button = result.form.querySelector('[type="submit"]');

			button.disabled = true;

			try {
				await save(result.data);
				result.box.close();

				return true;
			}
			catch (error) {
				result.box.showError(error.message);
				button.disabled = false;
				result = await new Promise((resolve) =>
					result.form.addEventListener('submit', (event) => {
						event.preventDefault();
						resolve({box: result.box, data: new FormData(result.form), form: result.form});
					}, {once: true})
				);
			}
		}

		return false;
	}

	function signInPrompt(element, title, text) {
		element.innerHTML = `<section class="mb-band mb-band-cream"><div class="mb-wrap" style="max-width:640px;text-align:center"><h2>${esc(title)}</h2><p class="mb-lead" style="margin:12px auto 24px">${esc(text)}</p><a class="mb-btn" href="${signInURL()}">Sign in</a><p class="mb-hint" style="margin-top:14px">New here? Create an account from the sign-in page.</p></div></section>`;
	}

	async function me() {
		return liferayAPI(`${USERS}/my-user-account`);
	}

	// ---- Host sign-up (docs/website.md 4) ----------------------------------------------------------------

	define('mb-host-signup', async (element) => {
		const intro = `
			<section class="mb-page-head mb-on-dark"><div class="mb-wrap">
				<div class="mb-eyebrow">Know your place better than anyone?</div>
				<h1>Become a MaddyBaba <em>Host.</em></h1>
				<p class="mb-lead">You don't need to own a hotel or a taxi. Offer your own services, connect guests with local businesses, guide travelers, plan complete trips or manage everything for a guest.</p>
			</div></section>`;

		if (!signedIn()) {
			element.innerHTML = intro;
			element.insertAdjacentHTML('beforeend', '<div></div>');
			signInPrompt(element.lastElementChild, 'Sign in to become a host', 'Hosts sign in with their MaddyBaba account so travelers can reach them and earnings go to the right person.');

			return;
		}

		element.innerHTML = intro + '<section class="mb-band mb-band-cream" style="padding-top:0"><div class="mb-wrap mb-results" style="max-width:860px"><div class="mb-form-card"><div class="mb-loading">Loading…</div></div></div></section>';

		const card = element.querySelector('.mb-form-card');
		const state = await hostState(await me());

		if (state.state === 'active') {
			card.innerHTML = `<h3>You're a MaddyBaba host</h3><p class="mb-lead">Your booking link is <strong>maddybaba.com/h/${esc(state.host.handle)}</strong>.</p><p style="margin-top:20px"><a class="mb-btn" href="${page('/host-dashboard')}">Go to your Host Dashboard</a></p>`;

			return;
		}

		if (state.state === 'inReview') {
			card.innerHTML = `<h3>Thanks, ${esc(state.application.displayName)}! Your profile is being reviewed.</h3><p class="mb-lead">Our team checks every new host (identity and local knowledge) before travelers can find you. We'll email you when you're live, usually within two working days.</p>`;

			return;
		}

		const destinations = await all('/o/c/destinations?sort=sortOrder:asc&fields=id,name');
		const steps = ['About you', 'What you offer', 'Terms'];
		let step = 0;

		card.innerHTML = `
			<ol class="mb-steps">${steps.map((name, i) => `<li class="mb-step"${i === 0 ? ' aria-current="step"' : ''}>${name}</li>`).join('')}</ol>
			<form novalidate>
				<fieldset data-step="0" style="border:0;margin:0;padding:0"><div class="mb-form-grid">
					<label class="mb-field"><span>Display name</span><input class="mb-input" name="displayName" required maxlength="60" placeholder="Rahul"></label>
					<label class="mb-field"><span>Phone</span><input class="mb-input" name="phone" required placeholder="+919876543210"></label>
					<label class="mb-field mb-wide"><span>Booking link</span><input class="mb-input" name="handle" required pattern="[a-z0-9-]{3,30}" placeholder="rahul-manali"><small class="mb-hint">maddybaba.com/h/<strong data-handle>your-link</strong> · 3–30 lowercase letters, numbers or hyphens</small></label>
					<label class="mb-field mb-wide"><span>Where are you a local?</span><select class="mb-input" name="destinationId" required><option value="">Choose your destination</option>${options(destinations.map((destination) => [destination.id, destination.name]))}</select></label>
				</div></fieldset>
				<fieldset data-step="1" hidden style="border:0;margin:0;padding:0"><div class="mb-form-grid">
					<label class="mb-field mb-wide"><span>What kind of host are you?</span><select class="mb-input" name="hostRole" required>${options(ROLES)}</select></label>
					<div class="mb-field mb-wide"><span>How will you help travelers?</span><div class="mb-ways" style="margin-top:4px">${checks('hostOffers', OFFERS)}</div></div>
					<div class="mb-field mb-wide"><span>Services you can arrange</span><div class="mb-chips">${SERVICES.filter(([value]) => value !== 'completeTrip').map(([value, text]) => `<button type="button" class="mb-chip" data-specialty="${value}" aria-pressed="false">${esc(text)}</button>`).join('')}</div></div>
					<label class="mb-field mb-wide"><span>Your line on the host card</span><input class="mb-input" name="quote" maxlength="160" placeholder="I help travelers arrange stays, transport, food and local experiences."><small class="mb-hint"><span data-count>0</span>/160</small></label>
					<label class="mb-field mb-wide"><span>About you</span><textarea class="mb-input" name="bio" placeholder="How long you've lived here, what you know, what travelers love about your trips."></textarea></label>
				</div></fieldset>
				<fieldset data-step="2" hidden style="border:0;margin:0;padding:0">
					<p class="mb-lead" style="margin-bottom:18px">Hosts earn a commission on every booking they bring in or deliver. Our team reviews every new host before travelers can find them.</p>
					<label class="mb-check"><input type="checkbox" name="termsAccepted" required> I accept the MaddyBaba host terms and commission policy.</label>
				</fieldset>
				<p class="mb-error" hidden style="margin-top:16px"></p>
				<div class="mb-form-actions"><button class="mb-btn mb-btn-outline" type="button" data-back hidden>Back</button><span></span><button class="mb-btn" type="submit">Continue</button></div>
			</form>`;

		const form = card.querySelector('form');
		const error = card.querySelector('.mb-error');
		const submit = form.querySelector('[type="submit"]');
		const back = form.querySelector('[data-back]');

		form.handle.addEventListener('input', () => {
			card.querySelector('[data-handle]').textContent = form.handle.value || 'your-link';
		});
		form.quote.addEventListener('input', () => {
			card.querySelector('[data-count]').textContent = form.quote.value.length;
		});
		card.querySelectorAll('[data-specialty]').forEach((chip) =>
			chip.addEventListener('click', () => chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')))
		);

		const show = (next) => {
			step = next;
			form.querySelectorAll('fieldset').forEach((fieldset) => (fieldset.hidden = Number(fieldset.dataset.step) !== step));
			card.querySelectorAll('.mb-step').forEach((item, i) => {
				if (i === step) {
					item.setAttribute('aria-current', 'step');
				}
				else {
					item.removeAttribute('aria-current');
				}

				item.classList.toggle('mb-done', i < step);
			});
			back.hidden = step === 0;
			submit.textContent = step === steps.length - 1 ? 'Submit for review' : 'Continue';
			error.hidden = true;
		};

		back.addEventListener('click', () => show(step - 1));

		form.addEventListener('submit', async (event) => {
			event.preventDefault();

			const fieldset = form.querySelector(`fieldset[data-step="${step}"]`);
			const invalid = [...fieldset.querySelectorAll('input, select, textarea')].find((input) => !input.checkValidity());

			if (invalid) {
				error.textContent = invalid.name === 'handle' ? 'Use 3–30 lowercase letters, numbers or hyphens for your booking link.' : invalid.name === 'termsAccepted' ? 'Please accept the host terms and commission policy.' : 'Please fill in this step.';
				error.hidden = false;
				invalid.focus();

				return;
			}

			if (step === 1 && !form.querySelector('[name="hostOffers"]:checked')) {
				error.textContent = 'Choose at least one way you will help travelers.';
				error.hidden = false;

				return;
			}

			if (step < steps.length - 1) {
				show(step + 1);

				return;
			}

			submit.disabled = true;

			try {
				submit.textContent = 'Submitting…';

				await submitApplication('signUp', {
					bio: form.bio.value,
					destinationId: form.destinationId.value,
					displayName: form.displayName.value,
					handle: form.handle.value.trim().toLowerCase(),
					hostOffers: [...form.querySelectorAll('[name="hostOffers"]:checked')].map((input) => input.value),
					hostRole: form.hostRole.value,
					phone: form.phone.value,
					quote: form.quote.value,
					specialties: [...card.querySelectorAll('[data-specialty][aria-pressed="true"]')].map((chip) => chip.dataset.specialty),
					termsAccepted: form.termsAccepted.checked,
				});

				card.innerHTML = `<h3>Thanks, ${esc(form.displayName.value)}! You're in the queue.</h3><p class="mb-lead">Our team will review your profile and email you when travelers can find you, usually within two working days. Your Host Dashboard opens once you're approved.</p>`;
			}
			catch (failure) {
				submit.disabled = false;

				// Go back to the step the message is about (the rules' messages, data-model.md 5).

				const message = failure.message;
				const stepOf = [[/mobile number|lowercase letters|booking link|destination/i, 0], [/quote/i, 1]].find(([pattern]) => pattern.test(message));

				show(stepOf ? stepOf[1] : step);
				error.textContent = message;
				error.hidden = false;
			}
		});
	});

	// ---- Dashboard frame ---------------------------------------------------------------------------------

	function frame(element, title, tabs, render) {
		const initial = (window.location.hash || '').slice(1);
		let current = tabs.some(([id]) => id === initial) ? initial : tabs[0][0];

		element.innerHTML = `<div class="mb-dash"><nav class="mb-dash-rail"><h2>${esc(title)}</h2>${tabs.map(([id, text]) => `<button data-tab="${id}">${esc(text)}</button>`).join('')}</nav><main class="mb-dash-main"></main></div>`;

		const main = element.querySelector('.mb-dash-main');
		const go = async (id) => {
			current = id;
			element.querySelectorAll('[data-tab]').forEach((button) => (button.dataset.tab === id ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current')));
			history.replaceState(null, '', '#' + id);
			main.innerHTML = '<div class="mb-loading">Loading…</div>';

			try {
				await render(id, main, () => go(current));
			}
			catch (error) {
				console.error('[MB] dashboard', error);
				main.innerHTML = `<div class="mb-empty">${esc(error.message)}</div>`;
			}
		};

		element.querySelector('.mb-dash-rail').addEventListener('click', (event) => event.target.dataset.tab && go(event.target.dataset.tab));
		go(current);
	}

	// ---- Host dashboard (docs/website.md 5) --------------------------------------------------------------

	define('mb-host-dashboard', async (element) => {
		if (!signedIn()) {
			signInPrompt(element, 'Sign in to your Host Dashboard', 'Manage your services, availability, bookings and earnings.');

			return;
		}

		element.innerHTML = '<div class="mb-wrap mb-band"><div class="mb-loading">Loading your dashboard…</div></div>';

		const state = await hostState(await me());

		if (state.state === 'none') {
			element.innerHTML = `<section class="mb-band mb-band-cream"><div class="mb-wrap" style="text-align:center;max-width:640px"><h2>You're not a host yet</h2><p class="mb-lead" style="margin:12px auto 24px">Turn your local knowledge into trips travelers love.</p><a class="mb-btn" href="${page('/become-a-host')}">Become a Host</a></div></section>`;

			return;
		}

		if (state.state === 'inReview') {
			element.innerHTML = `<section class="mb-band mb-band-cream"><div class="mb-wrap" style="text-align:center;max-width:680px"><h2>Your profile is being reviewed</h2><p class="mb-lead" style="margin:12px auto">Thanks, ${esc(state.application.displayName)}. Once our team approves your profile, your dashboard opens here: services, availability, bookings and earnings.</p></div></section>`;

			return;
		}

		const {host} = state;
		const accountId = host.r_accountHosts_accountEntryId;

		const destinations = await all('/o/c/destinations?sort=sortOrder:asc&fields=id,name');

		frame(element, 'Host Dashboard', [['overview', 'Overview'], ['services', 'My Services'], ['availability', 'Availability'], ['bookings', 'Bookings'], ['earnings', 'Earnings'], ['reviews', 'Reviews'], ['profile', 'Profile']], async (tab, main, reload) => {
			const fresh = await liferayAPI(`/o/c/hosts/${host.id}`);

			if (tab === 'overview') {
				const bookings = (await all('/o/c/bookings?sort=travelDate:asc')).filter((booking) => (booking.travelDate || '') >= today());

				main.innerHTML = `
					<h2>Namaste, ${esc(fresh.displayName)}</h2>
					<p class="mb-lead" style="margin:-8px 0 22px">${fresh.status?.code !== 0 ? pill('Profile changes in review', 'wait') : pill('Verified host')} · Your booking link: <strong>maddybaba.com/h/${esc(fresh.handle)}</strong> · <a class="mb-link" href="${page('/host')}?handle=${encodeURIComponent(fresh.handle)}">View public profile</a></p>
					<div class="mb-stats">${stat('Total bookings', fresh.totalBookings || 0)}${stat('Link clicks', fresh.linkClicks || 0)}${stat('Earnings this month', money(fresh.earningsThisMonth || 0))}${stat('Available balance', money(fresh.availableBalance || 0))}${stat('Rating', Number(fresh.ratingValue) ? `★ ${fresh.ratingValue} · ${fresh.reviewCount}` : '—')}</div>
					<div class="mb-card"><h3>Upcoming bookings</h3>${table(['Booking', 'Lead', 'Travel date', 'Travelers', 'Total', 'Status'], bookings.slice(0, 5).map((booking) => [esc(booking.bookingNumber), esc(booking.leadName), date(booking.travelDate), esc(booking.travelerCount), money(booking.total), esc(label(booking.bookingStatus))]), 'No upcoming bookings yet.')}</div>`;
			}
			else if (tab === 'services') {
				const listings = await all('/o/c/listings?sort=title:asc');

				main.innerHTML = `
					<div class="mb-toolbar"><h2 style="font-size:34px">My Services</h2><button class="mb-btn" data-add>${icon('spark')} Add a service</button></div>
					<p class="mb-hint" style="margin-bottom:16px">New services and changes are reviewed by our team before travelers see them.</p>
					<div class="mb-card">${table(['Service', 'Category', 'Price', 'Status', ''], listings.map((listing) => [
						`<strong>${esc(listing.title)}</strong><br><span class="mb-muted">${esc(listing.durationText || '')}</span>`,
						esc(label(listing.category)),
						`${money(listing.basePrice)} <span class="mb-muted">${esc(label(listing.priceUnit).toLowerCase())}</span>`,
						statusChip(listing),
						`<div class="mb-row-actions"><button class="mb-btn mb-btn-outline mb-btn-small" data-edit="${listing.id}">Edit</button><button class="mb-btn mb-btn-outline mb-btn-small" data-inclusions="${listing.id}">What's included</button></div>`,
					]), 'No services yet. Add your first one.')}</div>`;

				const form = (listing = {}) => `<div class="mb-form-grid">
					<label class="mb-field mb-wide"><span>Title</span><input class="mb-input" name="title" required value="${esc(listing.title)}" placeholder="Manali complete trip, 5 days / 4 nights"></label>
					<label class="mb-field"><span>Category</span><select class="mb-input" name="category">${options(SERVICES, key(listing.category))}</select></label>
					<label class="mb-field"><span>Destination</span><select class="mb-input" name="destinationId">${options(destinations.map((destination) => [destination.id, destination.name]), listing.r_destinationListings_c_destinationId || fresh.r_destinationHosts_c_destinationId)}</select></label>
					<label class="mb-field"><span>Price (₹)</span><input class="mb-input" name="basePrice" type="number" min="1" step="1" required value="${esc(listing.basePrice)}"></label>
					<label class="mb-field"><span>Per</span><select class="mb-input" name="priceUnit">${options(PRICE_UNITS, key(listing.priceUnit))}</select></label>
					<label class="mb-field"><span>Duration</span><input class="mb-input" name="durationText" value="${esc(listing.durationText)}" placeholder="5 days / 4 nights"></label>
					<label class="mb-field"><span>Max guests</span><input class="mb-input" name="maxGuests" type="number" min="1" value="${esc(listing.maxGuests)}"></label>
					<label class="mb-field mb-wide"><span>Short description</span><input class="mb-input" name="shortDescription" maxlength="140" value="${esc(listing.shortDescription)}"></label>
					<label class="mb-field mb-wide"><span>Description</span><textarea class="mb-input" name="description">${esc((listing.description || '').replace(/<[^>]+>/g, ''))}</textarea></label>
				</div>`;

				const values = (data) => ({
					basePrice: Number(data.get('basePrice')),
					category: data.get('category'),
					description: `<p>${esc(data.get('description'))}</p>`,
					durationText: data.get('durationText'),
					maxGuests: data.get('maxGuests') ? Number(data.get('maxGuests')) : null,
					priceUnit: data.get('priceUnit'),
					r_destinationListings_c_destinationId: Number(data.get('destinationId')),
					shortDescription: data.get('shortDescription'),
					title: data.get('title'),
				});

				main.querySelector('[data-add]').addEventListener('click', async () => {
					const saved = await edit('Add a service', form(), (data) =>
						liferayAPI('/o/c/listings', {
							body: {
								...values(data),
								r_accountListings_accountEntryId: accountId,
								r_hostListings_c_hostId: host.id,
								slug: `${String(data.get('title')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`,
							},
							method: 'POST',
						}), 'Submit for review');

					if (saved) {
						reload();
					}
				});

				main.querySelectorAll('[data-edit]').forEach((button) =>
					button.addEventListener('click', async () => {
						const listing = listings.find((item) => String(item.id) === button.dataset.edit);

						if (await edit('Edit service', form(listing), (data) => liferayAPI(`/o/c/listings/${listing.id}`, {body: values(data), method: 'PATCH'}), 'Submit for review')) {
							reload();
						}
					})
				);

				main.querySelectorAll('[data-inclusions]').forEach((button) =>
					button.addEventListener('click', async () => {
						const listingId = button.dataset.inclusions;
						const inclusions = await all(`/o/c/listinginclusions?filter=${encodeURIComponent(`r_listingInclusions_c_listingId eq '${listingId}'`)}&sort=sortOrder:asc`);
						const list = inclusions.map((inclusion) => `<li>${esc(inclusion.label)} ${key(inclusion.inclusionType) === 'addOn' ? `<span class="mb-muted">add-on ${money(inclusion.addOnPrice)}</span>` : ''}</li>`).join('') || '<li class="mb-muted">Nothing listed yet.</li>';

						if (await edit('What\'s included', `<ul class="mb-includes" style="margin-bottom:18px">${list}</ul><div class="mb-form-grid"><label class="mb-field mb-wide"><span>Add an item</span><input class="mb-input" name="label" required placeholder="Breakfast and dinner"></label><label class="mb-field"><span>Type</span><select class="mb-input" name="inclusionType">${options([['included', 'Included'], ['addOn', 'Add-on (extra cost)']])}</select></label><label class="mb-field"><span>Add-on price (₹)</span><input class="mb-input" name="addOnPrice" type="number" min="0"></label></div>`, (data) =>
							liferayAPI('/o/c/listinginclusions', {
								body: {
									addOnPrice: data.get('addOnPrice') ? Number(data.get('addOnPrice')) : null,
									inclusionType: data.get('inclusionType'),
									label: data.get('label'),
									r_accountListingInclusions_accountEntryId: accountId,
									r_listingInclusions_c_listingId: Number(listingId),
									sortOrder: inclusions.length + 1,
								},
								method: 'POST',
							}), 'Add')) {
							reload();
						}
					})
				);
			}
			else if (tab === 'availability') {
				const listings = await all('/o/c/listings?sort=title:asc&fields=id,title');

				if (!listings.length) {
					main.innerHTML = '<h2>Availability</h2><div class="mb-empty">Add a service first.</div>';

					return;
				}

				const selected = sessionStorage.getItem('mb-availability-listing') || String(listings[0].id);
				const listingId = listings.some((listing) => String(listing.id) === selected) ? selected : String(listings[0].id);
				const until = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
				const slots = (await all(`/o/c/availabilityslots?filter=${encodeURIComponent(`r_listingSlots_c_listingId eq '${listingId}'`)}&sort=slotDate:asc`)).filter((slot) => slot.slotDate.slice(0, 10) >= today() && slot.slotDate.slice(0, 10) <= until);

				main.innerHTML = `
					<div class="mb-toolbar"><h2 style="font-size:34px">Availability</h2><div class="mb-row-actions"><select class="mb-input" data-listing style="width:auto">${options(listings.map((listing) => [listing.id, listing.title]), listingId)}</select><button class="mb-btn" data-add>Add dates</button></div></div>
					<div class="mb-card">${table(['Date', 'Start', 'Capacity', 'Booked', 'Price', 'Status', ''], slots.map((slot) => [
						date(slot.slotDate.slice(0, 10)), esc(slot.startTime || ''), esc(slot.capacity), esc(slot.bookedCount || 0), Number(slot.priceOverride) ? money(slot.priceOverride) : '<span class="mb-muted">base</span>',
						esc(label(slot.slotStatus)),
						key(slot.slotStatus) === 'closed' ? `<button class="mb-btn mb-btn-outline mb-btn-small" data-status="open" data-slot="${slot.id}">Reopen</button>` : `<button class="mb-btn mb-btn-outline mb-btn-small" data-status="closed" data-slot="${slot.id}">Close</button>`,
					]), 'No dates in the next 45 days. Add some so travelers can book.')}</div>`;

				main.querySelector('[data-listing]').addEventListener('change', (event) => {
					sessionStorage.setItem('mb-availability-listing', event.target.value);
					reload();
				});

				main.querySelectorAll('[data-slot]').forEach((button) =>
					button.addEventListener('click', async () => {
						button.disabled = true;
						await liferayAPI(`/o/c/availabilityslots/${button.dataset.slot}`, {body: {slotStatus: button.dataset.status}, method: 'PATCH'});
						reload();
					})
				);

				main.querySelector('[data-add]').addEventListener('click', async () => {
					const existing = new Set((await all(`/o/c/availabilityslots?filter=${encodeURIComponent(`r_listingSlots_c_listingId eq '${listingId}'`)}&fields=slotDate`)).map((slot) => slot.slotDate.slice(0, 10)));

					if (await edit('Add dates', `<div class="mb-form-grid"><label class="mb-field"><span>From</span><input class="mb-input" type="date" name="from" required min="${today()}"></label><label class="mb-field"><span>To</span><input class="mb-input" type="date" name="to" required min="${today()}"></label><label class="mb-field"><span>Places per date</span><input class="mb-input" type="number" name="capacity" min="1" required value="4"></label><label class="mb-field"><span>Start time (optional)</span><input class="mb-input" name="startTime" placeholder="08:00"></label><label class="mb-field mb-wide"><span>Special price (₹, optional)</span><input class="mb-input" type="number" name="priceOverride" min="1"></label></div><p class="mb-hint">Dates that already have a slot are skipped.</p>`, async (data) => {
						const from = new Date(data.get('from') + 'T00:00:00Z');
						const to = new Date(data.get('to') + 'T00:00:00Z');

						if (to < from || (to - from) / 86400000 > 120) {
							throw new Error('Choose a range of up to 120 days, ending after it starts.');
						}

						for (let day = from; day <= to; day = new Date(day.getTime() + 86400000)) {
							const slotDate = day.toISOString().slice(0, 10);

							if (!existing.has(slotDate)) {
								await liferayAPI('/o/c/availabilityslots', {
									body: {
										capacity: Number(data.get('capacity')),
										priceOverride: data.get('priceOverride') ? Number(data.get('priceOverride')) : null,
										r_accountAvailabilitySlots_accountEntryId: accountId,
										r_listingSlots_c_listingId: Number(listingId),
										slotDate,
										slotStatus: 'open',
										startTime: data.get('startTime') || '',
									},
									method: 'POST',
								});
							}
						}
					}, 'Add dates')) {
						reload();
					}
				});
			}
			else if (tab === 'bookings') {
				const bookings = await all('/o/c/bookings?sort=travelDate:desc');

				main.innerHTML = `<h2>Bookings</h2><div class="mb-card">${table(['Booking', 'Lead', 'Phone', 'Travel date', 'Travelers', 'Total', 'Status'], bookings.map((booking) => [esc(booking.bookingNumber), esc(booking.leadName), esc(booking.phone), date(booking.travelDate), esc(booking.travelerCount), money(booking.total), esc(label(booking.bookingStatus))]), 'No bookings yet.')}</div>`;
			}
			else if (tab === 'earnings') {
				const [commissions, payouts] = await Promise.all([all('/o/c/commissions?sort=availableOn:asc'), all('/o/c/payouts?sort=requestedAt:desc')]);

				main.innerHTML = `
					<div class="mb-toolbar"><h2 style="font-size:34px">Earnings</h2><button class="mb-btn" data-payout ${Number(fresh.availableBalance) > 0 ? '' : 'disabled'}>Request payout</button></div>
					<div class="mb-stats">${stat('Earnings this month', money(fresh.earningsThisMonth || 0))}${stat('Available balance', money(fresh.availableBalance || 0))}${stat('Pending', money(commissions.filter((item) => key(item.commissionStatus) === 'pending').reduce((sum, item) => sum + Number(item.amount || 0), 0)))}</div>
					<div class="mb-card"><h3>Commissions</h3>${table(['Booking amount', 'Rate', 'Commission', 'Status', 'Available on'], commissions.map((item) => [money(item.baseAmount), `${esc(item.rate)}%`, `<strong>${money(item.amount)}</strong>`, esc(label(item.commissionStatus)), date(item.availableOn)]), 'Commissions appear when your bookings are confirmed.')}</div>
					<div class="mb-card"><h3>Payouts</h3>${table(['Requested', 'Amount', 'Method', 'Status', 'Paid'], payouts.map((item) => [date(item.requestedAt), money(item.amount), esc(item.payoutMethod), esc(label(item.payoutStatus)), date(item.processedAt)]), 'No payouts yet.')}</div>`;

				main.querySelector('[data-payout]').addEventListener('click', async () => {
					if (await edit('Request a payout', `<p class="mb-lead" style="margin-bottom:16px">Available: <strong>${money(fresh.availableBalance)}</strong>. Payouts go to your registered UPI ID.</p><label class="mb-field"><span>Amount (₹)</span><input class="mb-input" type="number" name="amount" min="1" step="0.01" max="${esc(fresh.availableBalance)}" required value="${esc(fresh.availableBalance)}"></label>`, (data) =>
						liferayAPI('/o/c/payouts', {
							body: {
								amount: Number(data.get('amount')),
								payoutMethod: 'UPI',
								payoutStatus: 'requested',
								r_accountPayouts_accountEntryId: accountId,
								r_hostPayouts_c_hostId: host.id,
								requestedAt: new Date().toISOString().slice(0, 19) + 'Z',
							},
							method: 'POST',
						}), 'Request payout')) {
						reload();
					}
				});
			}
			else if (tab === 'reviews') {
				const reviews = (await all(`/o/c/reviews?filter=${encodeURIComponent(`r_hostReviews_c_hostId eq '${host.id}'`)}&sort=dateCreated:desc`)).filter((review) => review.isPublished);

				main.innerHTML = `<h2>Reviews</h2><div class="mb-stats">${stat('Rating', Number(fresh.ratingValue) ? `★ ${fresh.ratingValue}` : '—')}${stat('Reviews', fresh.reviewCount || 0)}</div><div class="mb-card">${reviews.map((review) => `<div class="mb-review"><span class="mb-stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span> <strong>${esc(review.reviewerName)}</strong> <span class="mb-muted">· ${esc(review.reviewerCity)} · ${date(review.dateCreated)}</span><p style="margin-top:6px">${esc(review.comment)}</p></div>`).join('') || '<div class="mb-empty">No reviews yet.</div>'}</div>`;
			}
			else if (tab === 'profile') {
				const profile = {...fresh, destinationId: fresh.r_destinationHosts_c_destinationId, hostOffers: (fresh.hostOffers || []).map(key), hostRole: key(fresh.hostRole), inReview: fresh.status?.code !== 0, specialties: (fresh.specialties || []).map(key)};

				main.innerHTML = `<h2>Profile</h2>${profile.inReview ? '<p class="mb-notice" style="margin-bottom:18px">Your last changes are being reviewed. Travelers see your profile again once they\'re approved.</p>' : ''}
					<div class="mb-card"><form><div class="mb-form-grid">
						<label class="mb-field"><span>Display name</span><input class="mb-input" name="displayName" required value="${esc(profile.displayName)}"></label>
						<label class="mb-field"><span>Phone</span><input class="mb-input" name="phone" required value="${esc(profile.phone)}"></label>
						<label class="mb-field"><span>Host type</span><select class="mb-input" name="hostRole">${options(ROLES, profile.hostRole)}</select></label>
						<label class="mb-field"><span>Destination</span><select class="mb-input" name="destinationId">${options(destinations.map((destination) => [destination.id, destination.name]), profile.destinationId)}</select></label>
						<div class="mb-field mb-wide"><span>How you help travelers</span><div class="mb-ways">${checks('hostOffers', OFFERS, profile.hostOffers)}</div></div>
						<div class="mb-field mb-wide"><span>Services you can arrange</span><div class="mb-ways">${checks('specialties', SERVICES.filter(([value]) => value !== 'completeTrip'), profile.specialties)}</div></div>
						<label class="mb-field mb-wide"><span>Your line on the host card</span><input class="mb-input" name="quote" maxlength="160" value="${esc(profile.quote)}"></label>
						<label class="mb-field mb-wide"><span>About you</span><textarea class="mb-input" name="bio">${esc(profile.bio)}</textarea></label>
					</div><p class="mb-error" hidden></p><div class="mb-form-actions"><span class="mb-hint">Booking link: maddybaba.com/h/${esc(profile.handle)} (can't be changed)</span><button class="mb-btn" type="submit">Save and send for review</button></div></form></div>`;

				const form = main.querySelector('form');

				form.addEventListener('submit', async (event) => {
					event.preventDefault();

					const error = form.querySelector('.mb-error');

					try {
						form.querySelector('[type="submit"]').disabled = true;

						await submitApplication('profileEdit', {
							bio: form.bio.value,
							destinationId: Number(form.destinationId.value),
							displayName: form.displayName.value,
							hostOffers: [...form.querySelectorAll('[name="hostOffers"]:checked')].map((input) => input.value),
							hostRole: form.hostRole.value,
							phone: form.phone.value,
							quote: form.quote.value,
							specialties: [...form.querySelectorAll('[name="specialties"]:checked')].map((input) => input.value),
						});
						reload();
					}
					catch (failure) {
						error.textContent = failure.message;
						error.hidden = false;
						form.querySelector('[type="submit"]').disabled = false;
					}
				});
			}
		});
	});

	// ---- Ops dashboard (docs/website.md 6) ---------------------------------------------------------------

	define('mb-ops-dashboard', async (element) => {
		if (!signedIn()) {
			signInPrompt(element, 'Sign in to the Ops Dashboard', 'For the MaddyBaba operations team.');

			return;
		}

		if (!(await window.MB.isOps())) {
			element.innerHTML = '<section class="mb-band mb-band-cream"><div class="mb-wrap"><div class="mb-empty">Not authorized. The Ops Dashboard is for the MaddyBaba operations team.</div></div></section>';

			return;
		}

		frame(element, 'Ops Dashboard', [['overview', 'Overview'], ['approvals', 'Approvals'], ['reviews', 'Reviews'], ['bookings', 'Bookings'], ['payouts', 'Payouts'], ['search', 'Search insights']], async (tab, main, reload) => {
			if (tab === 'overview') {
				const [hosts, listings, bookings, commissions, payouts, logs] = await Promise.all([
					all('/o/c/hosts?fields=hostStatus,status'), all('/o/c/listings?fields=status'), all('/o/c/bookings?fields=total,bookingStatus,dateCreated'),
					all('/o/c/commissions?fields=amount,commissionStatus'), all('/o/c/payouts?fields=payoutStatus,amount'), all('/o/c/searchquerylogs?fields=resultCount,searchedAt'),
				]);
				const month = today().slice(0, 7);
				const thisMonth = bookings.filter((booking) => (booking.dateCreated || '').slice(0, 7) === month && key(booking.bookingStatus) !== 'cancelled');
				const week = new Date(Date.now() - 7 * 86400000).toISOString();

				main.innerHTML = `<h2>Overview</h2><div class="mb-stats">
					${stat('Active hosts', hosts.filter((item) => key(item.hostStatus) === 'active').length)}
					${stat('Hosts in review', hosts.filter((item) => item.status?.code !== 0).length)}
					${stat('Live listings', listings.filter((item) => item.status?.code === 0).length)}
					${stat('Listings in review', listings.filter((item) => item.status?.code !== 0).length)}
					${stat('Bookings this month', thisMonth.length)}
					${stat('Booked value this month', money(thisMonth.reduce((sum, item) => sum + Number(item.total || 0), 0)))}
					${stat('Commissions pending', money(commissions.filter((item) => key(item.commissionStatus) === 'pending').reduce((sum, item) => sum + Number(item.amount || 0), 0)))}
					${stat('Payouts requested', payouts.filter((item) => key(item.payoutStatus) === 'requested').length)}
					${stat('Zero-result searches (7 days)', logs.filter((item) => item.resultCount === 0 && (item.searchedAt || '') >= week).length)}
				</div>`;
			}
			else if (tab === 'approvals') {
				const tasks = (await liferayAPI(`${WORKFLOW}/assigned-to-my-roles?pageSize=100`)).items.filter((task) => !task.completed);
				const rows = [];

				for (const task of tasks) {
					const id = task.objectReviewed?.id;
					const type = /listing/i.test(task.objectReviewed?.assetType || task.objectReviewed?.resourceType || '') ? 'listings' : 'hosts';
					let entry = await liferayAPI(`/o/c/${type}/${id}`).catch(() => null);
					let kind = type;

					if (!entry) {
						kind = type === 'hosts' ? 'listings' : 'hosts';
						entry = await liferayAPI(`/o/c/${kind}/${id}`).catch(() => null);
					}

					const details = !entry ? esc(task.objectReviewed?.assetTitle || `Entry ${id}`) : kind === 'hosts'
						? `<strong>Host: ${esc(entry.displayName)}</strong> (${esc(entry.handle)})<br><span class="mb-muted">${esc(label(entry.hostRole))} · ${esc(entry.destinationName)} · ${esc(entry.phone)} · ${esc(label(entry.hostStatus))}</span><br>${esc(entry.quote || '')}`
						: `<strong>Listing: ${esc(entry.title)}</strong><br><span class="mb-muted">${esc(label(entry.category))} · ${money(entry.basePrice)} ${esc(label(entry.priceUnit).toLowerCase())} · ${esc(entry.hostDisplayName)} · ${esc(entry.destinationName)}</span><br>${esc(entry.shortDescription || '')}`;

					rows.push([details, date(task.dateCreated), `<div class="mb-row-actions"><button class="mb-btn mb-btn-small" data-task="${task.id}" data-transition="approve">Approve</button><button class="mb-btn mb-btn-outline mb-btn-small" data-task="${task.id}" data-transition="reject">Reject</button></div>`]);
				}

				main.innerHTML = `<h2>Approvals</h2><p class="mb-hint" style="margin:-8px 0 16px">New and edited hosts and listings wait here until you approve them. Approving a new host creates their account and makes them a verified host.</p><div class="mb-card">${table(['Waiting for review', 'Since', ''], rows, 'Nothing waiting for review.')}</div>`;

				main.querySelectorAll('[data-task]').forEach((button) =>
					button.addEventListener('click', async () => {
						const approve = button.dataset.transition === 'approve';
						const done = await edit(approve ? 'Approve' : 'Reject', `<label class="mb-field"><span>Comment ${approve ? '(optional)' : 'for the host'}</span><textarea class="mb-input" name="comment"${approve ? '' : ' required'}></textarea></label>`, async (data) => {
							await liferayAPI(`${WORKFLOW}/${button.dataset.task}/assign-to-me`, {body: {}, method: 'POST'});
							await liferayAPI(`${WORKFLOW}/${button.dataset.task}/change-transition`, {body: {comment: data.get('comment') || '', transitionName: button.dataset.transition}, method: 'POST'});
						}, approve ? 'Approve' : 'Reject');

						if (done) {
							reload();
						}
					})
				);
			}
			else if (tab === 'reviews') {
				const reviews = await all('/o/c/reviews?sort=dateCreated:desc');

				main.innerHTML = `<h2>Reviews</h2><p class="mb-hint" style="margin:-8px 0 16px">Only published reviews count towards ratings. Featured reviews appear on the home page (the first three).</p><div class="mb-card">${table(['Review', 'Host', 'Rating', 'Status', ''], reviews.map((review) => [
					`<strong>${esc(review.reviewerName)}</strong> <span class="mb-muted">· ${esc(review.reviewerCity)}</span><br>${esc(review.comment)}`,
					esc(review.hostDisplayName), '★'.repeat(review.rating),
					`${review.isPublished ? pill('Published') : pill('Hidden', 'wait')} ${review.isFeatured ? pill('Featured') : ''}`,
					`<div class="mb-row-actions"><button class="mb-btn mb-btn-outline mb-btn-small" data-review="${review.id}" data-field="isPublished" data-value="${!review.isPublished}">${review.isPublished ? 'Hide' : 'Publish'}</button><button class="mb-btn mb-btn-outline mb-btn-small" data-review="${review.id}" data-field="isFeatured" data-value="${!review.isFeatured}"${review.isPublished ? '' : ' disabled'}>${review.isFeatured ? 'Unfeature' : 'Feature'}</button></div>`,
				]), 'No reviews yet.')}</div>`;

				main.querySelectorAll('[data-review]').forEach((button) =>
					button.addEventListener('click', async () => {
						button.disabled = true;

						const value = button.dataset.value === 'true';

						await liferayAPI(`/o/c/reviews/${button.dataset.review}`, {body: {[button.dataset.field]: value, ...(button.dataset.field === 'isPublished' && !value ? {isFeatured: false} : {})}, method: 'PATCH'});
						reload();
					})
				);
			}
			else if (tab === 'bookings') {
				const [bookings, payments] = await Promise.all([all('/o/c/bookings?sort=dateCreated:desc'), all('/o/c/payments')]);
				const paymentOf = (bookingId) => payments.filter((payment) => payment.r_bookingPayments_c_bookingId === bookingId).map((payment) => label(payment.paymentStatus)).join(', ') || '—';

				main.innerHTML = `<h2>Bookings</h2><div class="mb-card">${table(['Booking', 'Lead', 'Travel date', 'Travelers', 'Total', 'Status', 'Payment'], bookings.map((booking) => [esc(booking.bookingNumber), `${esc(booking.leadName)}<br><span class="mb-muted">${esc(booking.email)}</span>`, date(booking.travelDate), esc(booking.travelerCount), money(booking.total), esc(label(booking.bookingStatus)), esc(paymentOf(booking.id))]), 'No bookings yet.')}</div>`;
			}
			else if (tab === 'payouts') {
				const [payouts, hosts] = await Promise.all([all('/o/c/payouts?sort=requestedAt:desc'), all('/o/c/hosts?fields=id,displayName,payoutUpiId')]);
				const hostOf = (id) => hosts.find((host) => host.id === id) || {};

				main.innerHTML = `<h2>Payouts</h2><div class="mb-card">${table(['Host', 'Amount', 'Method', 'Requested', 'Status', ''], payouts.map((payout) => [
					`${esc(hostOf(payout.r_hostPayouts_c_hostId).displayName)}<br><span class="mb-muted">${esc(hostOf(payout.r_hostPayouts_c_hostId).payoutUpiId)}</span>`,
					money(payout.amount), esc(payout.payoutMethod), date(payout.requestedAt), esc(label(payout.payoutStatus)),
					['requested', 'processing'].includes(key(payout.payoutStatus)) ? `<div class="mb-row-actions"><button class="mb-btn mb-btn-small" data-payout="${payout.id}" data-status="paid">Mark paid</button><button class="mb-btn mb-btn-outline mb-btn-small" data-payout="${payout.id}" data-status="failed">Failed</button></div>` : '',
				]), 'No payout requests.')}</div>`;

				main.querySelectorAll('[data-payout]').forEach((button) =>
					button.addEventListener('click', async () => {
						button.disabled = true;
						await liferayAPI(`/o/c/payouts/${button.dataset.payout}`, {body: {payoutStatus: button.dataset.status}, method: 'PATCH'});
						reload();
					})
				);
			}
			else if (tab === 'search') {
				const since = new Date(Date.now() - 30 * 86400000).toISOString();
				const logs = (await all('/o/c/searchquerylogs?sort=searchedAt:desc')).filter((log) => (log.searchedAt || '') >= since);
				const top = (items) => [...items.reduce((map, log) => map.set(log.queryText || '(no text)', (map.get(log.queryText || '(no text)') || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]).slice(0, 15);

				main.innerHTML = `<h2>Search insights</h2><p class="mb-hint" style="margin:-8px 0 16px">Last 30 days. Zero-result searches show which synonyms to add and where to recruit hosts.</p>
					<div class="mb-card"><h3>Top searches</h3>${table(['Query', 'Searches'], top(logs).map(([query, count]) => [esc(query), count]), 'No searches yet.')}</div>
					<div class="mb-card"><h3>Zero-result searches</h3>${table(['Query', 'Filters', 'Where', 'When'], logs.filter((log) => log.resultCount === 0).slice(0, 30).map((log) => [esc(log.queryText || '(no text)'), `<code>${esc(log.filtersUsed)}</code>`, esc(log.endpoint), date(log.searchedAt)]), 'None. Every search found something.')}</div>`;
			}
		});
	});

	window.MB.portal = true;
})();
