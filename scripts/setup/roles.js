// Creates the MB roles and sets their object permissions from data/roles.json (docs/data-model.md
// section 6), then verifies them with a GET.
// Idempotent: roles are looked up by ERC. The script only manages permissions on the entry and
// "add entry" resources of every MB object (plus Account Entry when listed); others, such as Guest's
// built-in ones, are kept exactly as they are. A role PUT adds and changes permissions but never
// removes them, so the script PUTs the full list back and then revokes, through JSONWS, any managed
// action that is no longer wanted. No role or entry is ever deleted.
//
// The Owner role isn't managed here: Liferay grants Owner its permissions on each entry when the entry
// is created, so role-level changes have no effect (see docs/data-model.md section 6).
//
// Usage: node scripts/setup/roles.js [--verify-only]

const liferay = require('./lib/liferay');
const {permissions, roles} = require('./data/roles.json');

const ADMIN_USER = '/o/headless-admin-user/v1.0';
const OBJECT_ADMIN = '/o/object-admin/v1.0';

const ACCOUNT_ENTRY = 'com.liferay.account.model.AccountEntry';
const ENTRY_ACTIONS = ['DELETE', 'PERMISSIONS', 'UPDATE', 'VIEW'];
const SCOPE_COMPANY = 1;
const SCOPE_GROUP_TEMPLATE = 3; // Account (and site/organization) role permissions apply per account.

let definitions;
let companyId;

const key = (permission) => `${permission.resourceName}|${permission.scope}|${permission.primaryKey}`;
const clean = ({actionIds, primaryKey, resourceName, scope}) => ({actionIds: [...actionIds].sort(), primaryKey, resourceName, scope});

async function loadContext() {
	const response = await liferay.get(`${OBJECT_ADMIN}/object-definitions?pageSize=500`);

	definitions = new Map(
		response.items
			.filter((definition) => definition.externalReferenceCode.startsWith('MB_'))
			.map((definition) => [definition.name, definition])
	);

	// Company-scope permissions use the company ID as primary key; read it from an existing one.

	const guest = await liferay.get(`${ADMIN_USER}/roles/by-external-reference-code/L_GUEST`);

	companyId = guest.rolePermissions.find((permission) => permission.scope === SCOPE_COMPANY).primaryKey;
}

// "Add entry" lives on com.liferay.object#<definition ID> (ObjectDefinitionImpl.getResourceName()).

const addResource = (definition) => `com.liferay.object#${definition.id}`;

// Resources a role's permissions are managed on: both resources of every MB object.

function managedResources(roleERC) {
	const resources = new Set([...definitions.values()].flatMap((definition) => [definition.className, addResource(definition)]));

	if (permissions[roleERC]?.AccountEntry) {
		resources.add(ACCOUNT_ENTRY);
	}

	return resources;
}

function desiredPermissions(roleERC, roleType) {
	const scope = roleType === 'account' ? SCOPE_GROUP_TEMPLATE : SCOPE_COMPANY;
	const primaryKey = roleType === 'account' ? '0' : companyId;
	const byResource = new Map();

	const grant = (resourceName, actionId) => {
		if (!byResource.has(resourceName)) {
			byResource.set(resourceName, new Set());
		}

		byResource.get(resourceName).add(actionId);
	};

	for (const [name, actions] of Object.entries(permissions[roleERC] || {})) {
		if (name === 'AccountEntry') {
			actions.forEach((action) => grant(ACCOUNT_ENTRY, action));
			continue;
		}

		for (const definition of name === '*' ? definitions.values() : [definitions.get(name)]) {
			if (!definition) {
				throw new Error(`${roleERC}: unknown object "${name}"`);
			}

			for (const action of actions) {
				if (action === 'ADD') {
					grant(addResource(definition), 'ADD_OBJECT_ENTRY');
				}
				else if (ENTRY_ACTIONS.includes(action)) {
					grant(definition.className, action);
				}
				else {
					throw new Error(`${roleERC}: unknown action "${action}"`);
				}
			}
		}
	}

	return [...byResource].map(([resourceName, actionIds]) => clean({actionIds: [...actionIds], primaryKey, resourceName, scope}));
}

function problems(roleERC, role) {
	const managed = managedResources(roleERC);
	// Revoking every action leaves an empty permission row behind; it grants nothing, so ignore it.

	const actual = role.rolePermissions
		.filter((permission) => managed.has(permission.resourceName) && permission.actionIds.length)
		.map(clean);
	const expected = desiredPermissions(roleERC, role.roleType);
	const actualByKey = new Map(actual.map((permission) => [key(permission), permission]));
	const issues = [];

	for (const permission of expected) {
		const found = actualByKey.get(key(permission));

		if (!found) {
			issues.push(`missing ${permission.resourceName} ${permission.actionIds.join(',')}`);
		}
		else if (found.actionIds.join(',') !== permission.actionIds.join(',')) {
			issues.push(`${permission.resourceName} has ${found.actionIds.join(',')}, expected ${permission.actionIds.join(',')}`);
		}

		actualByKey.delete(key(permission));
	}

	for (const permission of actualByKey.values()) {
		issues.push(`unexpected ${permission.resourceName} ${permission.actionIds.join(',')}`);
	}

	return issues;
}

async function syncRole(roleERC, definition) {
	const path = `${ADMIN_USER}/roles/by-external-reference-code/${roleERC}`;
	let role = await liferay.get(path);
	let result = 'unchanged';

	if (!role) {
		role = await liferay.post(`${ADMIN_USER}/roles`, {
			description: definition.description,
			externalReferenceCode: roleERC,
			name: definition.name,
			roleType: definition.type,
		});
		result = 'created';
	}

	if (!problems(roleERC, role).length) {
		return result;
	}

	const managed = managedResources(roleERC);
	const kept = role.rolePermissions.filter((permission) => !managed.has(permission.resourceName)).map(clean);
	const desired = desiredPermissions(roleERC, role.roleType);

	const rolePermissions = [...kept, ...desired];

	await liferay.put(path, {
		description: role.description,
		externalReferenceCode: roleERC,
		name: role.name,
		rolePermissions,
		roleType: role.roleType,
	});

	// The PUT adds and changes permissions but never removes them, so actions that are no longer
	// wanted on managed resources are revoked one by one.

	const wanted = new Map(desired.map((permission) => [key(permission), new Set(permission.actionIds)]));

	for (const permission of (await liferay.get(path)).rolePermissions.filter((item) => managed.has(item.resourceName))) {
		for (const actionId of permission.actionIds) {
			if (!wanted.get(key(permission))?.has(actionId)) {
				await liferay.jsonws('resourcepermission/remove-resource-permission', {
					actionId,
					companyId,
					groupId: 0,
					name: permission.resourceName,
					primKey: permission.primaryKey,
					roleId: role.id,
					scope: permission.scope,
				});
			}
		}
	}

	// Guard: permissions outside the managed resources must be exactly as before.

	const after = await liferay.get(path);
	const keptAfter = after.rolePermissions.filter((permission) => !managed.has(permission.resourceName)).map(clean);

	if (JSON.stringify(keptAfter.map(key).sort()) !== JSON.stringify(kept.map(key).sort())) {
		throw new Error(`${roleERC}: permissions outside MB objects changed (${kept.length} before, ${keptAfter.length} after)`);
	}

	return result === 'created' ? 'created' : 'updated';
}

function summary(roleERC, role) {
	const managed = managedResources(roleERC);
	const names = new Map(
		[...definitions.values()].flatMap((definition) => [
			[definition.className, definition.name],
			[addResource(definition), definition.name],
		])
	);
	const byObject = new Map();

	for (const permission of role.rolePermissions.filter((item) => managed.has(item.resourceName) && item.actionIds.length)) {
		const name = permission.resourceName === ACCOUNT_ENTRY ? 'AccountEntry' : names.get(permission.resourceName);
		const actions = permission.actionIds.map((action) => (action === 'ADD_OBJECT_ENTRY' ? 'ADD' : action));

		byObject.set(name, [...(byObject.get(name) || []), ...actions].sort());
	}

	return [...byObject].sort().map(([name, actions]) => `${name}:${actions.join('+')}`).join('  ');
}

async function main() {
	await loadContext();

	const all = [...roles.map((role) => [role.erc, role]), ['L_GUEST']];

	if (!process.argv.includes('--verify-only')) {
		for (const [roleERC, definition] of all) {
			console.log(`  ${(await syncRole(roleERC, definition)).padEnd(9)} ${roleERC}`);
		}
	}

	let failures = 0;

	console.log('\nVerification (GET by ERC):');

	for (const [roleERC] of all) {
		const role = await liferay.get(`${ADMIN_USER}/roles/by-external-reference-code/${roleERC}`);
		const issues = role ? problems(roleERC, role) : ['not found'];

		console.log(`  ${issues.length ? 'FAIL' : 'OK  '} ${roleERC.padEnd(13)} [${role?.roleType}] ${role ? summary(roleERC, role) : ''}`);

		for (const issue of issues) {
			console.log(`         ${issue}`);
		}

		failures += issues.length ? 1 : 0;
	}

	console.log(`\n${all.length - failures}/${all.length} roles match the spec.`);
	process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
