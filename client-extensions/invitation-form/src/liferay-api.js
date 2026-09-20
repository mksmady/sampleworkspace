/**
 * Uses Liferay.Util.fetch when available so the session cookie and CSRF
 * token (p_auth) are attached automatically — without it, Object Entry
 * writes get rejected with 403 even for a signed-in user. Falls back to
 * native fetch outside Liferay (e.g. local component development).
 */
const liferayFetch = (path, options = {}) => {
	const {Liferay} = window;

	const url = new URL(path, window.location.origin).toString();

	const fetchOptions = {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
	};

	if (Liferay && typeof Liferay.Util?.fetch === 'function') {
		return Liferay.Util.fetch(url, fetchOptions);
	}

	return fetch(url, {
		...fetchOptions,
		headers: {
			...fetchOptions.headers,
			...(Liferay?.authToken ? {'x-csrf-token': Liferay.authToken} : {}),
		},
	});
};

export default liferayFetch;
