import express from 'express';

import {encryptInvitationPayload} from './util/crypto.js';
import config from './util/configTreePath.js';
import {corsWithReady, liferayJWT} from './util/liferay-oauth2-resource-server.js';
import {logger} from './util/logger.js';

const serverPort = config['server.port'];
const app = express();

app.use(express.json());
app.use(corsWithReady);
app.use(liferayJWT);

app.get(config.readyPath, (req, res) => {
	res.send('READY');
});

// Called by Liferay's "GenerateInvitationToken" object action (onAfterAdd,
// on the InvitationDetails object). Receives the new object entry as JSON
// and returns it back with token/invitationLink filled in, which Liferay
// applies to the entry.
app.post('/invitation/token', async (req, res) => {
	const entry = req.body;

	const {accountManagerName, companyName, emailId, expiryDate} = entry;

	if (!emailId || !companyName || !expiryDate) {
		res.status(400).send('emailId, companyName and expiryDate are required');

		return;
	}

	try {
		const token = encryptInvitationPayload({
			accountManagerName,
			companyName,
			emailId,
			expiryDate,
			issuedAt: new Date().toISOString(),
		});

		const acceptBaseURL =
			config['invitation.accept.baseURL'] ||
			'http://localhost:8080/web/guest/accept-invite';

		const invitationLink = `${acceptBaseURL}?token=${token}`;

		logger.info(`Generated invitation token for ${emailId} / ${companyName}`);

		res.status(200).json({
			...entry,
			invitationLink,
			token,
		});
	}
	catch (error) {
		logger.error('Error generating invitation token\n%s', error);

		res.status(500).send('Error generating invitation token');
	}
});

app.listen(serverPort, () => {
	logger.info(`Invitation token service listening on ${serverPort}`);
});

export default app;
