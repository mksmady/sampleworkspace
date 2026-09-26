// Registers the object actions in data/actions.json (docs/data-model.md section 7): one action per
// object and trigger (ERC MB_<Object>_<trigger>), executed by an mb-actions-service client extension.
// Deploy the client extension first; Liferay only accepts executors that are registered.
// Idempotent: actions are looked up by ERC and updated in place when they differ. Nothing is deleted.
//
// Usage: node scripts/setup/actions.js [--verify-only]

const liferay = require('./lib/liferay');
const actions = require('./data/actions.json');

const API = '/o/object-admin/v1.0';

const wanted = actions.flatMap(({executor, object, triggers}) =>
	triggers.map((trigger) => ({
		active: true,
		conditionExpression: '',
		externalReferenceCode: `MB_${object}_${trigger}`,
		label: {en_US: `${object} ${trigger}`},
		name: `${object.charAt(0).toLowerCase()}${object.slice(1)}${trigger.charAt(0).toUpperCase()}${trigger.slice(1)}`,
		object,
		objectActionExecutorKey: `function#${executor}`,
		objectActionTriggerKey: trigger,
		parameters: {},
	}))
);

// The name is set on create only: Liferay doesn't change an action's name afterwards.

const KEYS = ['active', 'conditionExpression', 'objectActionExecutorKey', 'objectActionTriggerKey'];

const listActions = async (object) =>
	(await liferay.get(`${API}/object-definitions/by-external-reference-code/MB_${object}/object-actions?pageSize=200`)).items;

const problems = (expected, actual) =>
	actual ? KEYS.filter((key) => String(actual[key] ?? '') !== String(expected[key] ?? '')).map((key) => `${key}=${JSON.stringify(actual[key])}`) : ['not found'];

async function sync({object, ...action}) {
	const actual = (await listActions(object)).find((item) => item.externalReferenceCode === action.externalReferenceCode);

	if (!actual) {
		await liferay.post(`${API}/object-definitions/by-external-reference-code/MB_${object}/object-actions`, action);

		return 'created';
	}

	if (!problems(action, actual).length) {
		return 'unchanged';
	}

	await liferay.patch(`${API}/object-actions/${actual.id}`, action);

	return 'updated';
}

async function main() {
	if (!process.argv.includes('--verify-only')) {
		for (const action of wanted) {
			console.log(`  ${(await sync(action)).padEnd(9)} ${action.externalReferenceCode}`);
		}
	}

	let failures = 0;

	console.log('\nVerification (GET):');

	for (const action of wanted) {
		const actual = (await listActions(action.object)).find((item) => item.externalReferenceCode === action.externalReferenceCode);
		const issues = problems(action, actual);

		console.log(`  ${issues.length ? 'FAIL' : 'OK  '} ${action.externalReferenceCode.padEnd(34)} ${action.objectActionExecutorKey}${issues.length ? '  ' + issues.join('; ') : ''}`);
		failures += issues.length ? 1 : 0;
	}

	console.log(`\n${wanted.length - failures}/${wanted.length} object actions match the spec.`);
	process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
