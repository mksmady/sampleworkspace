// Creates the object definitions and their plain fields from data/objects.json
// (docs/data-model.md section 3), then verifies them with a GET.
// Idempotent: looks up definitions by ERC and fields by name, and only writes when something differs.
// Fields are only changed while a definition is a draft. On published definitions, differences are
// reported, never applied. Nothing is ever deleted, and a field's type is never changed.
//
// Usage: node scripts/setup/objects.js [--verify-only] [--publish]

const liferay = require('./lib/liferay');
const objects = require('./data/objects.json');

const API = '/o/object-admin/v1.0';
const LANGUAGE_ID = 'en_US';

const ATTACHMENT_SETTINGS = {
	acceptedFileExtensions: 'jpg, jpeg, png, webp',
	fileSource: 'userComputerToDocumentsAndMedia',
	maximumFileSize: '5',
};
const DB_TYPES = {
	Attachment: 'Long',
	Boolean: 'Boolean',
	Date: 'Date',
	DateTime: 'DateTime',
	Integer: 'Integer',
	LongInteger: 'Long',
	LongText: 'Clob',
	MultiselectPicklist: 'String',
	Picklist: 'String',
	PrecisionDecimal: 'BigDecimal',
	RichText: 'Clob',
	Text: 'String',
};
const TEXT_TYPES = ['LongText', 'RichText', 'Text'];
const KEYWORD_TYPES = ['MultiselectPicklist', 'Picklist'];

const definitionERC = (object) => `MB_${object.name}`;
const fieldERC = (object, field) => `MB_${object.name}_${field.name}`;
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function fieldSettings(field) {
	const settings = {};

	if (field.type === 'Attachment') {
		Object.assign(settings, ATTACHMENT_SETTINGS);
	}

	if (field.type === 'DateTime') {
		settings.timeStorage = 'convertToUTC';
	}

	// The `unique` property alone is ignored on this version; the setting is what applies it.

	if ((field.flags || '').includes('U')) {
		settings.uniqueValues = 'true';
	}

	if (field.default !== undefined) {
		settings.defaultValueType = 'inputAsValue';
		settings.defaultValue = field.default;
	}

	if (field.stateFlow) {
		settings.stateFlow = {
			objectStates: Object.entries(field.stateFlow).map(([key, targets]) => ({
				key,
				objectStateTransitions: targets.map((target) => ({key: target})),
			})),
		};
	}

	return settings;
}

function fieldPayload(object, field) {
	const flags = field.flags || '';
	// Liferay always indexes attachment file names as full text in the default language.

	const fullText = (flags.includes('S') && TEXT_TYPES.includes(field.type)) || field.type === 'Attachment';
	const keyword = !fullText && (TEXT_TYPES.includes(field.type) || KEYWORD_TYPES.includes(field.type));

	return {
		DBType: DB_TYPES[field.type],
		businessType: field.type,
		externalReferenceCode: fieldERC(object, field),
		indexed: true,
		indexedAsKeyword: keyword,
		...(fullText && {indexedLanguageId: LANGUAGE_ID}),
		label: {[LANGUAGE_ID]: words(field.name)},
		localized: false,
		...(field.picklist && {listTypeDefinitionExternalReferenceCode: field.picklist}),
		name: field.name,
		objectFieldSettings: Object.entries(fieldSettings(field)).map(([name, value]) => ({name, value})),
		required: flags.includes('R'),
		state: Boolean(field.stateFlow),
		unique: flags.includes('U'),
	};
}

function definitionProps(object) {
	return {
		enableCategorization: false,
		enableComments: false,
		externalReferenceCode: definitionERC(object),
		label: {[LANGUAGE_ID]: words(object.name)},
		name: object.name,
		panelCategoryKey: 'control_panel.object',
		pluralLabel: {[LANGUAGE_ID]: object.pluralLabel},
		scope: 'company',
		...(object.titleField && {titleObjectFieldName: object.titleField}),
	};
}

// Normalizes a stateFlow setting to {state: [targets]} so REST output (with ids) compares to the spec.

function stateFlowMap(value) {
	return Object.fromEntries(
		(value?.objectStates || []).map((state) => [
			state.key,
			(state.objectStateTransitions || []).map((transition) => transition.key).sort(),
		])
	);
}

function settingProblems(expected, actual) {
	const actualByName = new Map((actual || []).map((setting) => [setting.name, setting.value]));
	const problems = [];

	for (const {name, value} of expected) {
		const actualValue = actualByName.get(name);

		const same =
			name === 'stateFlow'
				? JSON.stringify(stateFlowMap(value)) === JSON.stringify(stateFlowMap(actualValue))
				: String(actualValue) === String(value);

		if (!same) {
			problems.push(`${name}=${JSON.stringify(actualValue)}`);
		}
	}

	return problems;
}

function fieldProblems(expected, actual) {
	if (!actual) {
		return ['missing'];
	}

	const problems = [];

	for (const key of ['businessType', 'externalReferenceCode', 'indexed', 'indexedAsKeyword', 'indexedLanguageId', 'listTypeDefinitionExternalReferenceCode', 'localized', 'required', 'state', 'unique']) {
		if (String(actual[key] ?? '') !== String(expected[key] ?? '')) {
			problems.push(`${key}=${JSON.stringify(actual[key])}`);
		}
	}

	if (actual.label?.[LANGUAGE_ID] !== expected.label[LANGUAGE_ID]) {
		problems.push(`label=${JSON.stringify(actual.label)}`);
	}

	return problems.concat(settingProblems(expected.objectFieldSettings, actual.objectFieldSettings));
}

function definitionProblems(object, definition) {
	const expected = definitionProps(object);
	const problems = [];

	for (const key of ['enableCategorization', 'enableComments', 'name', 'panelCategoryKey', 'scope', 'titleObjectFieldName']) {
		if (key in expected && String(definition[key]) !== String(expected[key])) {
			problems.push(`${key}=${JSON.stringify(definition[key])}`);
		}
	}

	for (const key of ['label', 'pluralLabel']) {
		if (definition[key]?.[LANGUAGE_ID] !== expected[key][LANGUAGE_ID]) {
			problems.push(`${key}=${JSON.stringify(definition[key])}`);
		}
	}

	return problems;
}

const getDefinition = (object) =>
	liferay.get(`${API}/object-definitions/by-external-reference-code/${definitionERC(object)}`);

const customFields = (definition) => definition.objectFields.filter((field) => !field.system && field.businessType !== 'Relationship');

async function sync(object) {
	const definition = await getDefinition(object);

	if (!definition) {
		await liferay.post(`${API}/object-definitions`, {
			...definitionProps(object),
			objectFields: object.fields.map((field) => fieldPayload(object, field)),
		});

		return 'created';
	}

	const draft = definition.status?.label === 'draft';
	const byName = new Map(customFields(definition).map((field) => [field.name, field]));
	let changed = false;

	for (const field of object.fields) {
		const expected = fieldPayload(object, field);
		const actual = byName.get(field.name);
		const problems = fieldProblems(expected, actual);

		if (!problems.length) {
			continue;
		}

		if (actual && actual.businessType !== expected.businessType) {
			console.warn(`  ${object.name}.${field.name}: type is ${actual.businessType}, spec says ${expected.businessType}. Needs a migration, not changed.`);
		}
		else if (!draft) {
			console.warn(`  ${object.name}.${field.name}: differs on a published object, not changed: ${problems.join('; ')}`);
		}
		else if (actual) {
			await liferay.put(`${API}/object-fields/${actual.id}`, expected);
			changed = true;
		}
		else {
			await liferay.post(`${API}/object-definitions/by-external-reference-code/${definitionERC(object)}/object-fields`, expected);
			changed = true;
		}
	}

	for (const name of byName.keys()) {
		if (!object.fields.some((field) => field.name === name)) {
			console.warn(`  ${object.name}: field "${name}" is not in the spec (kept)`);
		}
	}

	if (definitionProblems(object, definition).length) {
		await liferay.patch(`${API}/object-definitions/${definition.id}`, definitionProps(object));
		changed = true;
	}

	return changed ? 'updated' : 'unchanged';
}

async function verify() {
	const results = [];

	console.log('\nVerification (GET by ERC):');

	for (const object of objects) {
		const definition = await getDefinition(object);

		if (!definition) {
			console.log(`  FAIL ${definitionERC(object)} not found`);
			results.push({object, ok: false});
			continue;
		}

		const byName = new Map(customFields(definition).map((field) => [field.name, field]));
		const problems = definitionProblems(object, definition).map((problem) => `definition ${problem}`);

		for (const field of object.fields) {
			for (const problem of fieldProblems(fieldPayload(object, field), byName.get(field.name))) {
				problems.push(`${field.name}: ${problem}`);
			}
		}

		const extras = [...byName.keys()].filter((name) => !object.fields.some((field) => field.name === name));

		console.log(
			`  ${problems.length ? 'FAIL' : 'OK  '} ${definitionERC(object).padEnd(22)} ${definition.status.label.padEnd(9)} fields=${object.fields.length - problems.filter((p) => p.endsWith('missing')).length}/${object.fields.length}` +
				(extras.length ? ` extra=${extras.join(',')}` : '') +
				(definition.restContextPath ? `  ${definition.restContextPath}` : '')
		);

		for (const problem of problems) {
			console.log(`         ${problem}`);
		}

		results.push({definition, object, ok: !problems.length});
	}

	console.log(`\n${results.filter((result) => result.ok).length}/${objects.length} objects match the spec.`);

	return results;
}

async function publish(results) {
	console.log('\nPublish:');

	for (const {definition, object, ok} of results) {
		if (object.publish === false || !definition || definition.status.label !== 'draft') {
			continue;
		}

		if (!ok) {
			console.log(`  skipped   ${definitionERC(object)} (does not match the spec)`);
			continue;
		}

		await liferay.post(`${API}/object-definitions/${definition.id}/publish`);
		console.log(`  published ${definitionERC(object)}`);
	}
}

async function main() {
	if (!process.argv.includes('--verify-only')) {
		const counts = {created: 0, unchanged: 0, updated: 0};

		for (const object of objects) {
			const result = await sync(object);

			counts[result]++;
			console.log(`  ${result.padEnd(9)} ${definitionERC(object)}`);
		}

		console.log(`\ncreated=${counts.created} updated=${counts.updated} unchanged=${counts.unchanged}`);
	}

	let results = await verify();

	if (process.argv.includes('--publish')) {
		await publish(results);
		results = await verify();
	}

	process.exitCode = results.every((result) => result.ok) ? 0 : 1;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
