// Creates or updates the picklists in data/picklists.json (docs/data-model.md section 2).
// Idempotent: looks up each picklist by ERC and only writes when something differs.
// Never deletes: entries on the instance that are not in the spec are kept and reported.
//
// Usage: node scripts/setup/picklists.js [--verify-only]

const liferay = require('./lib/liferay');
const picklists = require('./data/picklists.json');

const API = '/o/headless-admin-list-type/v1.0/list-type-definitions';
const LANGUAGE_ID = 'en-US'; // i18n maps are keyed by BCP 47 tags

const entryERC = (picklist, key) => `${picklist.erc}_${key}`;

function desiredEntries(picklist, existingEntries) {
	const byKey = new Map(existingEntries.map((entry) => [entry.key, entry]));

	const entries = Object.entries(picklist.entries).map(([key, label]) => ({
		...(byKey.get(key) && {id: byKey.get(key).id}),
		externalReferenceCode: entryERC(picklist, key),
		key,
		name_i18n: {[LANGUAGE_ID]: label},
	}));

	// Keep entries that are not in the spec so the PUT never removes them.

	const extras = existingEntries.filter((entry) => !(entry.key in picklist.entries));

	for (const entry of extras) {
		entries.push({
			externalReferenceCode: entry.externalReferenceCode,
			id: entry.id,
			key: entry.key,
			name_i18n: entry.name_i18n,
		});
	}

	return {entries, extras};
}

function differences(picklist, definition) {
	const problems = [];

	if (definition.name_i18n?.[LANGUAGE_ID] !== picklist.name) {
		problems.push(`name is "${definition.name_i18n?.[LANGUAGE_ID]}"`);
	}

	const byKey = new Map(definition.listTypeEntries.map((entry) => [entry.key, entry]));

	for (const [key, label] of Object.entries(picklist.entries)) {
		const entry = byKey.get(key);

		if (!entry) {
			problems.push(`missing ${key}`);
		}
		else if (entry.name_i18n?.[LANGUAGE_ID] !== label) {
			problems.push(`${key} label is "${entry.name_i18n?.[LANGUAGE_ID]}"`);
		}
		else if (entry.externalReferenceCode !== entryERC(picklist, key)) {
			problems.push(`${key} ERC is "${entry.externalReferenceCode}"`);
		}
	}

	return problems;
}

async function sync(picklist) {
	const path = `${API}/by-external-reference-code/${picklist.erc}`;
	const existing = await liferay.get(path);

	if (!existing) {
		await liferay.post(API, {
			externalReferenceCode: picklist.erc,
			listTypeEntries: desiredEntries(picklist, []).entries,
			name_i18n: {[LANGUAGE_ID]: picklist.name},
		});

		return 'created';
	}

	const {entries, extras} = desiredEntries(picklist, existing.listTypeEntries);

	for (const entry of extras) {
		console.warn(`  ${picklist.erc}: entry "${entry.key}" is not in the spec (kept)`);
	}

	if (!differences(picklist, existing).length) {
		return 'unchanged';
	}

	await liferay.put(path, {
		externalReferenceCode: picklist.erc,
		listTypeEntries: entries,
		name_i18n: {[LANGUAGE_ID]: picklist.name},
	});

	const updated = await liferay.get(path);

	if (updated.listTypeEntries.length < existing.listTypeEntries.length) {
		throw new Error(`${picklist.erc}: entry count dropped after update`);
	}

	return 'updated';
}

async function verify() {
	let failures = 0;

	console.log('\nVerification (GET by ERC):');

	for (const picklist of picklists) {
		const definition = await liferay.get(`${API}/by-external-reference-code/${picklist.erc}`);
		const problems = definition ? differences(picklist, definition) : ['not found'];
		const count = definition ? definition.listTypeEntries.length : 0;

		console.log(
			`  ${problems.length ? 'FAIL' : 'OK  '} ${picklist.erc.padEnd(24)} id=${String(definition?.id ?? '-').padEnd(8)} entries=${count}/${Object.keys(picklist.entries).length}` +
				(problems.length ? `  ${problems.join('; ')}` : '')
		);

		failures += problems.length ? 1 : 0;
	}

	console.log(`\n${picklists.length - failures}/${picklists.length} picklists match the spec.`);

	return failures;
}

async function main() {
	if (!process.argv.includes('--verify-only')) {
		const counts = {created: 0, unchanged: 0, updated: 0};

		for (const picklist of picklists) {
			const result = await sync(picklist);

			counts[result]++;
			console.log(`  ${result.padEnd(9)} ${picklist.erc}`);
		}

		console.log(`\ncreated=${counts.created} updated=${counts.updated} unchanged=${counts.unchanged}`);
	}

	process.exitCode = (await verify()) ? 1 : 0;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
