// Deploys the "MB Ops Approval" workflow (data/mb-ops-approval.xml) and links it to the objects that
// need approval (docs/data-model.md sections 3.3, 3.7 and 6), then verifies both with a GET.
// Idempotent: each deploy creates a new workflow version, so the definition is only deployed when the
// live one differs from the file; links are only added when missing. Nothing is ever deleted.
//
// Usage: node scripts/setup/workflows.js [--verify-only]

const fs = require('fs');
const path = require('path');

const liferay = require('./lib/liferay');

const WORKFLOW = '/o/headless-admin-workflow/v1.0';
const OBJECT_ADMIN = '/o/object-admin/v1.0';

const DEFINITION = {erc: 'MB_OpsApproval', file: 'data/mb-ops-approval.xml', name: 'MB Ops Approval'};
const LINKED_OBJECTS = ['Host', 'Listing'];

const xml = fs.readFileSync(path.join(__dirname, DEFINITION.file), 'utf8').replace(/\r\n/g, '\n');

// Liferay returns the definition as a JSON tree ({"#tag-name", "#child-nodes", ...}). Rendering it back
// to XML the same way the file was written lets the two be compared exactly.

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toXml(node, indent) {
	const attributes = Object.entries(node)
		.filter(([key]) => !key.startsWith('#'))
		.map(([key, value]) => ` ${key}="${escape(value).replace(/"/g, '&quot;')}"`)
		.join('');
	const pad = '\t'.repeat(indent);
	const tag = node['#tag-name'];

	if (node['#child-nodes']?.length) {
		return `${pad}<${tag}${attributes}>\n${node['#child-nodes'].map((child) => toXml(child, indent + 1)).join('\n')}\n${pad}</${tag}>`;
	}

	if (node['#cdata-value'] !== undefined) {
		return `${pad}<${tag}${attributes}><![CDATA[${node['#cdata-value']}]]></${tag}>`;
	}

	if (node['#value'] !== undefined) {
		return `${pad}<${tag}${attributes}>${escape(node['#value'])}</${tag}>`;
	}

	return `${pad}<${tag}${attributes} />`;
}

const liveXml = (definition) => '<?xml version="1.0"?>\n\n' + toXml(JSON.parse(definition.content), 0) + '\n';

async function syncDefinition() {
	const live = await liferay.get(`${WORKFLOW}/workflow-definitions/by-name/${encodeURIComponent(DEFINITION.name)}`);

	if (live && live.active && liveXml(live) === xml) {
		return 'unchanged';
	}

	await liferay.post(`${WORKFLOW}/workflow-definitions/deploy`, {
		active: true,
		content: xml,
		externalReferenceCode: DEFINITION.erc,
		name: DEFINITION.name,
		title: DEFINITION.name,
	});

	return live ? 'updated' : 'created';
}

// Links are managed through the workflow API: the object definition's own workflowDefinitionLinks
// field is ignored on PATCH and not returned on GET in this version. Objects are company-scoped, so
// links use group 0.

async function links() {
	const live = await liferay.get(`${WORKFLOW}/workflow-definitions/by-name/${encodeURIComponent(DEFINITION.name)}`);
	const response = await liferay.get(`${WORKFLOW}/workflow-definitions/${live.id}/workflow-definition-links?pageSize=100`);

	return {items: response.items, live};
}

async function className(objectName) {
	return (await liferay.get(`${OBJECT_ADMIN}/object-definitions/by-external-reference-code/MB_${objectName}`)).className;
}

async function syncLink(objectName) {
	const {items, live} = await links();
	const name = await className(objectName);

	if (items.some((link) => link.className === name)) {
		return 'unchanged';
	}

	await liferay.post(`${WORKFLOW}/workflow-definitions/${live.id}/workflow-definition-links`, {
		className: name,
		groupId: 0,
		workflowDefinitionName: DEFINITION.name,
		workflowDefinitionVersion: live.version,
	});

	return 'linked';
}

async function main() {
	if (!process.argv.includes('--verify-only')) {
		console.log(`  ${(await syncDefinition()).padEnd(9)} workflow ${DEFINITION.name}`);

		for (const objectName of LINKED_OBJECTS) {
			console.log(`  ${(await syncLink(objectName)).padEnd(9)} MB_${objectName} -> ${DEFINITION.name}`);
		}
	}

	console.log('\nVerification (GET):');

	const live = await liferay.get(`${WORKFLOW}/workflow-definitions/by-name/${encodeURIComponent(DEFINITION.name)}`);
	const checks = [[`workflow ${DEFINITION.name} is active and matches ${DEFINITION.file}`, Boolean(live?.active && liveXml(live) === xml), live ? `version ${live.version}` : 'not found']];

	const {items} = live ? await links() : {items: []};

	for (const objectName of LINKED_OBJECTS) {
		const name = await className(objectName);
		const link = items.find((item) => item.className === name);

		checks.push([`MB_${objectName} uses ${DEFINITION.name}`, Boolean(link), link ? `${name}, group ${link.groupId}` : 'no link']);
	}

	for (const [label, ok, detail] of checks) {
		console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}  (${detail})`);
	}

	process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
