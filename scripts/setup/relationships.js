// Creates the one-to-many relationships in data/relationships.json (docs/data-model.md section 4),
// then verifies each one and the relationship field it adds to the child object.
// Idempotent: relationships are looked up by ERC on the parent. Only the label and deletion type are
// ever updated; any other difference is reported. Nothing is ever deleted.
//
// Usage: node scripts/setup/relationships.js [--verify-only]

const liferay = require('./lib/liferay');
const relationships = require('./data/relationships.json');

const API = '/o/object-admin/v1.0';
const LANGUAGE_ID = 'en_US';

const SYSTEM_ERCS = {Account: 'L_ACCOUNT', User: 'L_USER'};

const definitionERC = (name) => SYSTEM_ERCS[name] || `MB_${name}`;
const relationshipERC = (relationship) => `MB_${relationship.name}`;
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function payload(relationship) {
	return {
		deletionType: relationship.deletionType,
		externalReferenceCode: relationshipERC(relationship),
		label: {[LANGUAGE_ID]: words(relationship.name)},
		name: relationship.name,
		objectDefinitionExternalReferenceCode1: definitionERC(relationship.parent),
		objectDefinitionExternalReferenceCode2: definitionERC(relationship.child),
		type: 'oneToMany',
	};
}

async function findRelationship(relationship) {
	const response = await liferay.get(
		`${API}/object-definitions/by-external-reference-code/${definitionERC(relationship.parent)}/object-relationships?pageSize=200`
	);

	return response.items.find((item) => item.externalReferenceCode === relationshipERC(relationship) && !item.reverse);
}

// Problems that the script may fix (label, deletion type) versus ones it only reports.

function problems(relationship, actual) {
	const expected = payload(relationship);
	const fixable = [];
	const other = [];

	if (actual.deletionType !== expected.deletionType) {
		fixable.push(`deletionType=${actual.deletionType}`);
	}

	if (actual.label?.[LANGUAGE_ID] !== expected.label[LANGUAGE_ID]) {
		fixable.push(`label=${JSON.stringify(actual.label)}`);
	}

	for (const key of ['name', 'objectDefinitionExternalReferenceCode2', 'type']) {
		if (actual[key] !== expected[key]) {
			other.push(`${key}=${actual[key]}`);
		}
	}

	return {fixable, other};
}

async function sync(relationship) {
	const actual = await findRelationship(relationship);

	if (!actual) {
		await liferay.post(
			`${API}/object-definitions/by-external-reference-code/${definitionERC(relationship.parent)}/object-relationships`,
			payload(relationship)
		);

		return 'created';
	}

	const {fixable, other} = problems(relationship, actual);

	if (other.length) {
		console.warn(`  ${relationship.name}: differs from the spec, not changed: ${other.join('; ')}`);
	}

	if (!fixable.length) {
		return 'unchanged';
	}

	await liferay.put(`${API}/object-relationships/by-external-reference-code/${relationshipERC(relationship)}`, {
		...actual,
		deletionType: relationship.deletionType,
		label: payload(relationship).label,
	});

	return 'updated';
}

async function verify() {
	const children = new Map();
	let failures = 0;

	console.log('\nVerification (GET):');

	for (const relationship of relationships) {
		const actual = await findRelationship(relationship);
		const issues = [];
		let fieldName = '-';

		if (!actual) {
			issues.push('not found');
		}
		else {
			const {fixable, other} = problems(relationship, actual);

			issues.push(...fixable, ...other);

			if (!children.has(relationship.child)) {
				children.set(
					relationship.child,
					await liferay.get(`${API}/object-definitions/by-external-reference-code/${definitionERC(relationship.child)}`)
				);
			}

			const field = children
				.get(relationship.child)
				.objectFields.find(
					(objectField) =>
						objectField.businessType === 'Relationship' &&
						objectField.objectRelationshipExternalReferenceCode === relationshipERC(relationship)
				);

			if (field) {
				fieldName = field.name;
			}
			else {
				issues.push(`no relationship field on ${relationship.child}`);
			}
		}

		console.log(
			`  ${issues.length ? 'FAIL' : 'OK  '} ${relationship.parent.padEnd(16)} -> ${relationship.child.padEnd(16)} ${relationship.name.padEnd(27)} ${relationship.deletionType.padEnd(12)} ${fieldName}` +
				(issues.length ? `  ${issues.join('; ')}` : '')
		);

		failures += issues.length ? 1 : 0;
	}

	console.log(`\n${relationships.length - failures}/${relationships.length} relationships match the spec.`);

	return failures;
}

async function main() {
	if (!process.argv.includes('--verify-only')) {
		const counts = {created: 0, unchanged: 0, updated: 0};

		for (const relationship of relationships) {
			const result = await sync(relationship);

			counts[result]++;
			console.log(`  ${result.padEnd(9)} ${relationshipERC(relationship)}`);
		}

		console.log(`\ncreated=${counts.created} updated=${counts.updated} unchanged=${counts.unchanged}`);
	}

	process.exitCode = (await verify()) ? 1 : 0;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
