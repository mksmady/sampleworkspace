// Minimal Liferay headless client. Credentials come from the environment only.

const BASE_URL = (process.env.LIFERAY_URL || 'http://localhost:8080').replace(/\/$/, '');
const {LIFERAY_USER, LIFERAY_PASSWORD} = process.env;

if (!LIFERAY_USER || !LIFERAY_PASSWORD) {
	console.error('Set LIFERAY_USER and LIFERAY_PASSWORD in the environment.');
	process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${LIFERAY_USER}:${LIFERAY_PASSWORD}`).toString('base64');

async function request(method, path, body) {
	const response = await fetch(BASE_URL + path, {
		body: body === undefined ? undefined : JSON.stringify(body),
		headers: {
			Accept: 'application/json',
			Authorization: AUTH,
			'Content-Type': 'application/json',
		},
		method,
	});

	if (response.status === 404 && method === 'GET') {
		return null;
	}

	const text = await response.text();

	if (!response.ok) {
		throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
	}

	return text ? JSON.parse(text) : null;
}

module.exports = {
	get: (path) => request('GET', path),
	patch: (path, body) => request('PATCH', path, body),
	post: (path, body) => request('POST', path, body),
	put: (path, body) => request('PUT', path, body),
};
