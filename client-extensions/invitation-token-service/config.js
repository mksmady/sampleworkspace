export default {
	configTreePaths: [
		process.env.LIFERAY_ROUTES_CLIENT_EXTENSION,
		process.env.LIFERAY_ROUTES_DXP,
	].filter(Boolean),
	'liferay.oauth.application.external.reference.codes':
		'invitation-token-service-oaua',
	readyPath: '/ready',
	'server.port': process.env.PORT || 8090,
};
