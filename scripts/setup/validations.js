// Creates the expression validation rules in data/validations.json (docs/data-model.md section 5),
// then verifies each one with a GET.
// Idempotent: rules are looked up by ERC (MB_<Object>_<name>) and updated in place when they differ.
// Rules with a "field" show their error on it; the others on the form. Nothing is ever deleted.
//
// Usage: node scripts/setup/validations.js [--verify-only]

const liferay = require('./lib/liferay');
const rules = require('./data/validations.json');

const API = '/o/object-admin/v1.0';
const LANGUAGE_ID = 'en_US';

const definitionERC = (rule) => `MB_${rule.object}`;
const ruleERC = (rule) => `MB_${rule.object}_${rule.name}`;
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function payload(rule) {
	return {
		// A rule the engine can't enforce is kept inactive until its replacement exists (see its "note").

		active: rule.active !== false,
		engine: 'ddm',
		errorLabel: {[LANGUAGE_ID]: rule.error},
		externalReferenceCode: ruleERC(rule),
		name: {[LANGUAGE_ID]: words(rule.name)},
		// Rules on a field show their error on it; rules without one (e.g. on a relationship) on the form.

		objectValidationRuleSettings: rule.field
			? [{name: 'outputObjectFieldExternalReferenceCode', value: `MB_${rule.object}_${rule.field}`}]
			: [],
		outputType: rule.field ? 'partialValidation' : 'fullValidation',
		script: rule.script,
	};
}

function problems(rule, actual) {
	if (!actual) {
		return ['not found'];
	}

	const expected = payload(rule);
	const issues = [];

	for (const key of ['active', 'engine', 'outputType', 'script']) {
		if (actual[key] !== expected[key]) {
			issues.push(`${key}=${JSON.stringify(actual[key])}`);
		}
	}

	for (const key of ['errorLabel', 'name']) {
		if (actual[key]?.[LANGUAGE_ID] !== expected[key][LANGUAGE_ID]) {
			issues.push(`${key}=${JSON.stringify(actual[key])}`);
		}
	}

	const output = (actual.objectValidationRuleSettings || []).find(
		(setting) => setting.name === 'outputObjectFieldExternalReferenceCode'
	);

	if (output?.value !== expected.objectValidationRuleSettings[0]?.value) {
		issues.push(`output field=${JSON.stringify(output?.value)}`);
	}

	return issues;
}

async function findRule(rule) {
	const response = await liferay.get(
		`${API}/object-definitions/by-external-reference-code/${definitionERC(rule)}/object-validation-rules?pageSize=200`
	);

	return response.items.find((item) => item.externalReferenceCode === ruleERC(rule));
}

async function sync(rule) {
	const actual = await findRule(rule);

	if (!actual) {
		await liferay.post(
			`${API}/object-definitions/by-external-reference-code/${definitionERC(rule)}/object-validation-rules`,
			payload(rule)
		);

		return 'created';
	}

	if (!problems(rule, actual).length) {
		return 'unchanged';
	}

	await liferay.put(`${API}/object-validation-rules/${actual.id}`, payload(rule));

	return 'updated';
}

async function verify() {
	let failures = 0;

	console.log('\nVerification (GET):');

	for (const rule of rules) {
		const issues = problems(rule, await findRule(rule));

		console.log(
			`  ${issues.length ? 'FAIL' : 'OK  '} ${ruleERC(rule).padEnd(34)} ${rule.script}` +
				(issues.length ? `\n         ${issues.join('; ')}` : '')
		);

		failures += issues.length ? 1 : 0;
	}

	console.log(`\n${rules.length - failures}/${rules.length} validation rules match the spec.`);

	return failures;
}

async function main() {
	if (!process.argv.includes('--verify-only')) {
		const counts = {created: 0, unchanged: 0, updated: 0};

		for (const rule of rules) {
			const result = await sync(rule);

			counts[result]++;
			console.log(`  ${result.padEnd(9)} ${ruleERC(rule)}`);
		}

		console.log(`\ncreated=${counts.created} updated=${counts.updated} unchanged=${counts.unchanged}`);
	}

	process.exitCode = (await verify()) ? 1 : 0;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
