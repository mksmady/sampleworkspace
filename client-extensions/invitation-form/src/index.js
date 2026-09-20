import React from 'react';
import {createRoot} from 'react-dom/client';

import InvitationForm from './InvitationForm.js';

class InvitationFormElement extends HTMLElement {
	connectedCallback() {
		this.root = createRoot(this);

		this.root.render(<InvitationForm />);
	}

	disconnectedCallback() {
		this.root.unmount();

		delete this.root;
	}
}

const ELEMENT_ID = 'invitation-form';

if (!customElements.get(ELEMENT_ID)) {
	customElements.define(ELEMENT_ID, InvitationFormElement);
}
