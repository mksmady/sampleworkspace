/**
 * Verifies that inbound requests actually came from this Liferay instance's
 * "invitation-token-service-oaua" OAuth2 user-agent application, by
 * validating the bearer JWT against Liferay's own JWKS endpoint. This is
 * what stops anyone but Liferay itself from calling /invitation/token.
 */

import cors from 'cors';
import {verify} from 'jsonwebtoken';
import jwktopem from 'jwk-to-pem';
import fetch from 'node-fetch';

import config from './configTreePath.js';
import {logger} from './logger.js';

const domains = (config['com.liferay.lxc.dxp.domains'] || '').split('\n');
const externalReferenceCode =
	(config['liferay.oauth.application.external.reference.codes'] || '').split(
		','
	)[0];
const lxcDXPMainDomain = config['com.liferay.lxc.dxp.mainDomain'];
const lxcDXPServerProtocol =
	config['com.liferay.lxc.dxp.server.protocol'] || 'https';

const uriPath =
	config[externalReferenceCode + '.oauth2.jwks.uri'] || '/o/oauth2/jwks';

const oauth2JWKSURI = `${lxcDXPServerProtocol}://${lxcDXPMainDomain}${uriPath}`;

const allowList = domains
	.filter(Boolean)
	.map((domain) => `${lxcDXPServerProtocol}://${domain}`);

const corsOptions = {
	origin(origin, callback) {
		callback(null, allowList.includes(origin));
	},
};

export async function corsWithReady(req, res, next) {
	if (req.originalUrl === config.readyPath) {
		return next();
	}

	return cors(corsOptions)(req, res, next);
}

export async function liferayJWT(req, res, next) {
	if (req.path === config.readyPath) {
		return next();
	}

	const authorization = req.headers.authorization;

	if (!authorization) {
		res.status(401).send('No authorization header');

		return;
	}

	const [, bearerToken] = authorization.split('Bearer ');

	try {
		const jwksResponse = await fetch(oauth2JWKSURI);

		if (jwksResponse.status === 200) {
			const jwks = await jwksResponse.json();

			const jwksPublicKey = jwktopem(jwks.keys[0]);

			const decoded = verify(bearerToken, jwksPublicKey, {
				algorithms: ['RS256'],
				ignoreExpiration: true, // TODO use refresh token instead
			});

			const applicationResponse = await fetch(
				`${lxcDXPServerProtocol}://${lxcDXPMainDomain}/o/oauth2/application?externalReferenceCode=${externalReferenceCode}`
			);

			const {client_id: clientId} = await applicationResponse.json();

			if (decoded.client_id === clientId) {
				req.jwt = decoded;

				next();
			}
			else {
				logger.info(
					'JWT token client_id value does not match expected client_id value.'
				);

				res.status(401).send('Invalid authorization');
			}
		}
		else {
			logger.error(
				'Error fetching JWKS %s %s',
				jwksResponse.status,
				jwksResponse.statusText
			);

			res.status(401).send('Invalid authorization header');
		}
	}
	catch (error) {
		logger.error('Error validating JWT token\n%s', error);

		res.status(401).send('Invalid authorization header');
	}
}
