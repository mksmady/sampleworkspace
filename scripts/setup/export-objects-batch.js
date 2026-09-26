// Regenerates the batch files of client-extensions/mb-objects-batch from the configured instance
// (docs/data-model.md; phase 9). Run it after the setup scripts whenever the data model changes, and
// review the diff. Files:
//   batch/00-list-type-definitions.batch-engine-data.json  the MB_ picklists
//   batch/01-object-definitions.batch-engine-data.json     the User and Account system definitions
//       carrying only their relationships to MB_ objects, then the MB_ objects (fields, relationships,
//       validation rules, object actions, account restriction)
//   batch/02-object-definitions-settings.batch-engine-data.json  the MB_ objects again: the update pass
//       applies settings Liferay ignores when it creates a definition in one step
// Uses Liferay's own object definition export, so the items are in the format its import expects,
// minus instance-specific values (IDs, dates, class names) and with picklists referenced by ERC.
// Roles, permissions, workflows and seed data are not part of the batch (see the README).
//
// Usage: node scripts/setup/export-objects-batch.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const liferay = require('./lib/liferay');
const objects = require('./data/objects.json');

const OUT = path.join(__dirname, '..', '..', 'client-extensions', 'mb-objects-batch', 'batch');
const SYSTEM_PARENTS = ['L_ACCOUNT', 'L_USER'];

const DROP = new Set([
	'actions', 'className', 'creator', 'dateCreated', 'dateModified', 'id', 'listTypeDefinitionId', 'objectDefinitionId',
	'objectDefinitionId1', 'objectDefinitionId2', 'objectFieldId', 'parameterObjectFieldId', 'portlet', 'restContextPath',
]);

// Recursively removes instance-specific values and sorts keys, so regenerated files diff cleanly.

function clean(value) {
	if (Array.isArray(value)) {
		return value.map(clean);
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.filter((key) => !DROP.has(key) && value[key] !== undefined)
				.sort()
				.map((key) => [key, clean(value[key])])
		);
	}

	return value;
}

// The export's content is a zip with a single deflated export.json.

function unzipSingle(buffer) {
	const nameLength = buffer.readUInt16LE(26);
	const extraLength = buffer.readUInt16LE(28);
	const method = buffer.readUInt16LE(8);
	let compressedSize = buffer.readUInt32LE(18);
	const start = 30 + nameLength + extraLength;

	if (compressedSize === 0) {

		// Sizes are in the central directory when the entry was streamed.

		const central = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));

		compressedSize = buffer.readUInt32LE(central + 20);
	}

	const data = buffer.subarray(start, start + compressedSize);

	return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
}

async function exportDefinitions() {
	const task = await liferay.post('/o/object-admin/v1.0/object-definitions/export-batch?contentType=JSON', {});

	for (let attempt = 0; attempt < 120; attempt++) {
		const status = await liferay.get(`/o/headless-batch-engine/v1.0/export-task/${task.id}`);

		if (status.executeStatus === 'COMPLETED') {
			const response = await fetch(`${liferay.baseURL}/o/headless-batch-engine/v1.0/export-task/${task.id}/content`, {
				headers: {Authorization: liferay.authorization},
			});

			return JSON.parse(unzipSingle(Buffer.from(await response.arrayBuffer())));
		}

		if (status.executeStatus === 'FAILED') {
			throw new Error(`Export failed: ${status.errorMessage}`);
		}

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error('Export timed out');
}

function batchFile(className, items) {
	return JSON.stringify(
		{
			configuration: {
				className,
				parameters: {containsHeaders: 'true', createStrategy: 'UPSERT', importStrategy: 'ON_ERROR_FAIL', updateStrategy: 'UPDATE'},
				taskItemDelegateName: 'DEFAULT',
			},
			items,
		},
		null,
		'\t'
	) + '\n';
}

async function main() {
	const picklists = (await liferay.get('/o/headless-admin-list-type/v1.0/list-type-definitions?pageSize=500')).items
		.filter((picklist) => picklist.externalReferenceCode.startsWith('MB_'))
		.sort((a, b) => a.externalReferenceCode.localeCompare(b.externalReferenceCode))
		.map((picklist) =>
			clean({
				externalReferenceCode: picklist.externalReferenceCode,
				listTypeEntries: picklist.listTypeEntries.map(({externalReferenceCode, key, name_i18n}) => ({externalReferenceCode, key, name_i18n})),
				name_i18n: picklist.name_i18n,
			})
		);

	// Picklist fields are exported with instance-specific IDs only: reference picklists by ERC instead.

	const picklistOf = new Map(objects.flatMap((object) => object.fields.filter((field) => field.picklist).map((field) => [`MB_${object.name}.${field.name}`, field.picklist])));

	const exported = await exportDefinitions();
	const order = new Map(objects.map((object, index) => [`MB_${object.name}`, index]));

	const definitions = exported
		.filter((definition) => order.has(definition.externalReferenceCode))
		.sort((a, b) => order.get(a.externalReferenceCode) - order.get(b.externalReferenceCode))
		.map((definition) => {
			for (const field of definition.objectFields) {
				const picklist = picklistOf.get(`${definition.externalReferenceCode}.${field.name}`);

				if (picklist) {
					field.listTypeDefinitionExternalReferenceCode = picklist;
				}
			}

			return definition;
		});

	// The export serializes aggregation filters as an internal object ({"jsonarray": ...}) that the
	// import can't read; the REST API returns them properly, so take them from there.

	for (const definition of definitions) {
		const rest = await liferay.get(`/o/object-admin/v1.0/object-definitions/by-external-reference-code/${definition.externalReferenceCode}`);

		for (const field of definition.objectFields) {
			const filters = (field.objectFieldSettings || []).find((setting) => setting.name === 'filters');

			if (filters) {
				const restField = rest.objectFields.find((item) => item.name === field.name);

				filters.value = (restField.objectFieldSettings.find((setting) => setting.name === 'filters') || {value: []}).value;
			}
		}
	}

	const cleaned = definitions.map((definition) => clean({...definition, objectFields: definition.objectFields.filter((field) => !field.system)}));

	// System parents only carry their relationships to MB_ objects; the rest of them is Liferay's.

	const systemParents = exported
		.filter((definition) => SYSTEM_PARENTS.includes(definition.externalReferenceCode))
		.map((definition) =>
			clean({
				externalReferenceCode: definition.externalReferenceCode,
				name: definition.name,
				objectRelationships: definition.objectRelationships.filter((relationship) => relationship.objectDefinitionExternalReferenceCode2.startsWith('MB_')),
			})
		);

	fs.mkdirSync(OUT, {recursive: true});
	fs.writeFileSync(path.join(OUT, '00-list-type-definitions.batch-engine-data.json'), batchFile('com.liferay.headless.admin.list.type.dto.v1_0.ListTypeDefinition', picklists));
	// System parents go first: the import creates placeholder definitions for relationship targets that
	// don't exist yet (filled in by their own items later), so the Account relationship fields exist
	// before the MB objects that are account-restricted by them.

	fs.writeFileSync(path.join(OUT, '01-object-definitions.batch-engine-data.json'), batchFile('com.liferay.object.admin.rest.dto.v1_0.ObjectDefinition', [...systemParents, ...cleaned]));

	// Second pass, same definitions: Liferay ignores some settings (enableCategorization) when it creates a
	// definition in one step, but applies them on update.

	fs.writeFileSync(path.join(OUT, '02-object-definitions-settings.batch-engine-data.json'), batchFile('com.liferay.object.admin.rest.dto.v1_0.ObjectDefinition', cleaned));

	console.log(`Wrote ${picklists.length} picklists and ${cleaned.length} object definitions (+ ${systemParents.map((d) => `${d.externalReferenceCode} with ${d.objectRelationships.length} relationships`).join(', ')}), and a second settings pass, to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
