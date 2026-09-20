import React, {useEffect, useState} from 'react';

import liferayFetch from './liferay-api.js';

// Confirm this against Control Panel -> Objects -> Invitation Details ->
// System Information -> REST Context Path after the batch extension
// deploys; Liferay derives it from the object name and it isn't
// guaranteed to be exactly this string.
const OBJECT_REST_PATH = 'o/c/invitationdetailses';

const INITIAL_FORM_VALUES = {
	companyName: '',
	emailId: '',
	expiryDate: '',
};

async function pollForInvitationLink(entryId, attempts = 6, delayMs = 800) {
	for (let attempt = 0; attempt < attempts; attempt++) {
		const response = await liferayFetch(`${OBJECT_REST_PATH}/${entryId}`);

		if (response.ok) {
			const entry = await response.json();

			if (entry.invitationLink) {
				return entry.invitationLink;
			}
		}

		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}

	return '';
}

const InvitationForm = () => {
	const [formValues, setFormValues] = useState(INITIAL_FORM_VALUES);
	const [accountManagerName, setAccountManagerName] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [status, setStatus] = useState(null);
	const [invitationLink, setInvitationLink] = useState('');

	useEffect(() => {
		liferayFetch('o/headless-admin-user/v1.0/my-user-account')
			.then((response) => response.json())
			.then((user) => {
				const name = [user.givenName, user.familyName]
					.filter(Boolean)
					.join(' ');

				setAccountManagerName(name || user.name || '');
			})
			.catch(() => setAccountManagerName(''));
	}, []);

	const handleChange = (event) => {
		const {name, value} = event.target;

		setFormValues((previous) => ({...previous, [name]: value}));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();

		setSubmitting(true);
		setStatus(null);
		setInvitationLink('');

		try {
			const createResponse = await liferayFetch(OBJECT_REST_PATH, {
				body: JSON.stringify({
					accountManagerName,
					...formValues,
				}),
				method: 'POST',
			});

			if (!createResponse.ok) {
				throw new Error(
					`Failed to create invitation (HTTP ${createResponse.status})`
				);
			}

			const entry = await createResponse.json();

			const link = await pollForInvitationLink(entry.id);

			if (link) {
				setInvitationLink(link);
				setStatus({
					message: 'Invitation created and link generated.',
					type: 'success',
				});
			}
			else {
				setStatus({
					message:
						'Invitation was saved, but the token is still being generated. Reopen the entry in a moment to get the link.',
					type: 'warning',
				});
			}

			setFormValues(INITIAL_FORM_VALUES);
		}
		catch (error) {
			setStatus({message: error.message, type: 'error'});
		}
		finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="invitation-form">
			<style>{`
				.invitation-form { max-width: 420px; font-family: inherit; }
				.invitation-form label { display: block; margin-top: 12px; font-weight: 600; font-size: 13px; }
				.invitation-form input { width: 100%; box-sizing: border-box; padding: 8px; margin-top: 4px; border: 1px solid #ccc; border-radius: 4px; }
				.invitation-form .account-manager { margin-top: 14px; font-size: 13px; color: #555; }
				.invitation-form button { margin-top: 18px; padding: 8px 16px; border: none; border-radius: 4px; background: #1a5dd6; color: #fff; cursor: pointer; }
				.invitation-form button:disabled { opacity: 0.6; cursor: default; }
				.invitation-form .status { margin-top: 12px; font-size: 13px; }
				.invitation-form .status--success { color: #1a7f37; }
				.invitation-form .status--warning { color: #9a6700; }
				.invitation-form .status--error { color: #cf222e; }
				.invitation-form .link { margin-top: 8px; word-break: break-all; font-size: 13px; }
			`}</style>

			<h2>Send an Invitation</h2>

			<form onSubmit={handleSubmit}>
				<label htmlFor="invitation-email">Email</label>
				<input
					id="invitation-email"
					name="emailId"
					onChange={handleChange}
					required
					type="email"
					value={formValues.emailId}
				/>

				<label htmlFor="invitation-company">Company Name</label>
				<input
					id="invitation-company"
					name="companyName"
					onChange={handleChange}
					required
					type="text"
					value={formValues.companyName}
				/>

				<label htmlFor="invitation-expiry">Expiry Date</label>
				<input
					id="invitation-expiry"
					name="expiryDate"
					onChange={handleChange}
					required
					type="date"
					value={formValues.expiryDate}
				/>

				<p className="account-manager">
					Account Manager:{' '}
					<strong>{accountManagerName || 'Loading...'}</strong>
				</p>

				<button
					disabled={submitting || !accountManagerName}
					type="submit"
				>
					{submitting ? 'Sending...' : 'Send Invite'}
				</button>
			</form>

			{status && (
				<p className={`status status--${status.type}`}>{status.message}</p>
			)}

			{invitationLink && (
				<p className="link">
					<a href={invitationLink} rel="noreferrer" target="_blank">
						{invitationLink}
					</a>
				</p>
			)}
		</div>
	);
};

export default InvitationForm;
