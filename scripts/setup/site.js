// Builds and verifies the Maddybaba website's pages (docs/website.md section 2; data/site/site.json):
// widget pages (1_column) holding the mb-web-elements custom elements in order, created by ERC through
// the portal's layout service (JSONWS). This Liferay version answers page creation through
// headless-delivery and headless-admin-site with UnsupportedOperationException.
//   - creates missing pages; sets the widgets, hidden flag and order of existing ones only where they
//     differ;
//   - page view permissions (headless-admin-site page permissions, by page ERC): "anyone" (Guest and Site Member View), "members" (signed-in only: no Guest
//     View), "ops" (only Ops Admin and Administrator);
//   - verifies each page as a guest: public pages render their elements in order; restricted pages are
//     not shown.
// Idempotent; never deletes. Deploy client-extensions/mb-web-elements first.
//
// Usage: node scripts/setup/site.js [--verify-only]

const liferay = require('./lib/liferay');
const site = require('./data/site/site.json');


const widget = (companyId, element) =>
	`com_liferay_client_extension_web_internal_portlet_ClientExtensionEntryPortlet_${companyId}_LXC_${element.replace(/-/g, '_')}`;

const typeSettings = (companyId, page) => `layout-template-id=1_column\ncolumn-1=${page.elements.map((element) => widget(companyId, element)).join(',')}\n`;

// Liferay may add its own keys to typeSettings; compare only the layout template and the column.

function columns(settings) {
	const lines = String(settings || '').split('\n');
	const value = (key) => (lines.find((line) => line.startsWith(`${key}=`)) || '').slice(key.length + 1);

	return `${value('layout-template-id')}|${value('column-1')}`;
}

async function context() {
	const group = await liferay.get(`/o/headless-admin-user/v1.0/sites/by-friendly-url-path${site.site}`);

	if (!group) {
		throw new Error(`Site ${site.site} not found`);
	}

	const {companyId, externalReferenceCode} = await liferay.jsonws('group/get-group', {groupId: group.id});

	return {companyId, groupId: group.id, siteERC: externalReferenceCode};
}

const fetchPage = async ({groupId}, page) => {
	const layout = await liferay.jsonws('layout/fetch-layout-by-external-reference-code', {externalReferenceCode: page.erc, groupId});

	return layout && layout.plid ? layout : null;
};

async function sync(ctx, page, priority) {
	let layout = await fetchPage(ctx, page);
	let result = 'unchanged';

	if (!layout) {
		layout = await liferay.jsonws('layout/add-layout', {
			descriptionMap: '{}',
			externalReferenceCode: page.erc,
			friendlyURLMap: JSON.stringify({en_US: page.friendlyURL}),
			groupId: ctx.groupId,
			hidden: Boolean(page.hidden),
			keywordsMap: '{}',
			localeNamesMap: JSON.stringify({en_US: page.name}),
			localeTitlesMap: JSON.stringify({en_US: page.name}),
			parentLayoutId: 0,
			privateLayout: false,
			robotsMap: '{}',
			serviceContext: JSON.stringify({addGroupPermissions: true, addGuestPermissions: true}),
			type: 'portlet',
			typeSettings: typeSettings(ctx.companyId, page),
		});
		result = 'created';
	}
	else if (columns(layout.typeSettings) !== columns(typeSettings(ctx.companyId, page))) {
		await liferay.jsonws('layout/update-type-settings', {
			groupId: ctx.groupId,
			layoutId: layout.layoutId,
			privateLayout: false,
			typeSettings: typeSettings(ctx.companyId, page),
		});
		result = 'updated';
	}

	if (layout.priority !== priority) {
		await liferay.jsonws('layout/update-priority', {plid: layout.plid, priority});
		result = result === 'unchanged' ? 'updated' : result;
	}

	if (Boolean(layout.hidden) !== Boolean(page.hidden)) {
		console.warn(`  ${page.erc}: hidden is ${layout.hidden}, spec says ${Boolean(page.hidden)}; change it in Site Builder > Pages`);
	}

	await permissions(ctx, page);

	return result;
}

// View permissions per page (docs/website.md 2): VIEW for Guest and Site Member ("anyone"), Site Member
// only ("members"), or Ops Admin only ("ops"; Administrator can always view). Other actions are kept.

const VIEWERS = {anyone: ['Guest', 'Site Member'], members: ['Site Member'], ops: ['Ops Admin']};

async function permissions(ctx, page) {
	const path = `/o/headless-admin-site/v1.0/sites/${ctx.siteERC}/site-pages/${page.erc}/permissions`;
	const items = (await liferay.get(path)).items.map(({actionIds, roleName}) => ({actionIds, roleName}));
	const viewers = VIEWERS[page.viewableBy];
	let changed = false;

	for (const roleName of ['Guest', 'Site Member', 'Ops Admin']) {
		let item = items.find((entry) => entry.roleName === roleName);
		const wanted = viewers.includes(roleName);

		if (!item && wanted) {
			item = {actionIds: [], roleName};
			items.push(item);
		}

		if (item && item.actionIds.includes('VIEW') !== wanted) {
			item.actionIds = wanted ? [...item.actionIds, 'VIEW'] : item.actionIds.filter((actionId) => actionId !== 'VIEW');
			changed = true;
		}
	}

	if (changed) {
		await liferay.put(path, items);
	}
}

async function verify(ctx) {
	let failures = 0;
	const url = (page) => `${liferay.baseURL}/web${site.site}${page.friendlyURL}`;

	console.log('\nVerification:');

	for (const page of site.pages) {
		const problems = [];
		const layout = await fetchPage(ctx, page);

		if (!layout) {
			problems.push('page missing');
		}
		else if (columns(layout.typeSettings) !== columns(typeSettings(ctx.companyId, page))) {
			problems.push(`widgets are ${columns(layout.typeSettings)}`);
		}

		const response = await fetch(url(page), {redirect: 'manual'});

		if (page.viewableBy === 'anyone') {
			const html = response.status === 200 ? await response.text() : '';
			const positions = page.elements.map((element) => html.indexOf(`<${element}`));

			if (response.status !== 200) {
				problems.push(`guest gets ${response.status}`);
			}
			else if (positions.some((position) => position < 0)) {
				problems.push(`not rendered: ${page.elements.filter((element, i) => positions[i] < 0).join(', ')}`);
			}
			else if (positions.some((position, i) => i && position < positions[i - 1])) {
				problems.push('elements out of order');
			}
		}
		else if (response.status === 200 && (await response.text()).includes(`<${page.elements[1]}`)) {
			problems.push('a guest can see it');
		}

		console.log(`  ${problems.length ? 'FAIL' : 'OK  '} ${page.friendlyURL.padEnd(16)} ${page.viewableBy.padEnd(8)} ${page.elements.length} elements${problems.length ? `  ${problems.join('; ')}` : ''}`);
		failures += problems.length ? 1 : 0;
	}

	console.log(`\n${site.pages.length - failures}/${site.pages.length} pages match the spec.`);

	return failures;
}

async function main() {
	const ctx = await context();

	if (!process.argv.includes('--verify-only')) {
		for (const [priority, page] of site.pages.entries()) {
			console.log(`  ${(await sync(ctx, page, priority)).padEnd(9)} ${page.erc} (${page.friendlyURL})`);
		}
	}

	process.exitCode = (await verify(ctx)) ? 1 : 0;
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
