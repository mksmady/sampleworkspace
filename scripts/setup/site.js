// Sets up and verifies the Maddybaba website on the Maddybaba site (phase 10a; data/site/site.json):
//   - creates or updates (PUT by ERC) the home page's marketing copy as Basic Web Content articles
//     (data/site/web-content/*.html);
//   - verifies the pages, which are built in the UI (scripts/setup/README.md): each page must show the
//     widgets listed in site.json in that order (mb-web-elements custom elements and Web Content Display
//     widgets showing the articles), and render them for a guest.
// Pages are not scripted: this Liferay version rejects page creation through the headless APIs
// (UnsupportedOperationException from headless-delivery and headless-admin-site).
// Idempotent; never deletes. Deploy client-extensions/mb-web-elements first.
//
// Usage: node scripts/setup/site.js [--verify-only]

const fs = require('fs');
const path = require('path');

const liferay = require('./lib/liferay');
const site = require('./data/site/site.json');

const DELIVERY = '/o/headless-delivery/v1.0';
const JOURNAL_CONTENT = 'com_liferay_journal_content_web_portlet_JournalContentPortlet';

const customElementWidget = (companyId, erc) =>
	`com_liferay_client_extension_web_internal_portlet_ClientExtensionEntryPortlet_${companyId}_LXC_${erc.replace(/-/g, '_')}`;

async function context() {
	const group = await liferay.get(`/o/headless-admin-user/v1.0/sites/by-friendly-url-path${site.site}`);

	if (!group) {
		throw new Error(`Site ${site.site} not found`);
	}

	const {companyId} = await liferay.jsonws('group/get-group', {groupId: group.id});
	// Basic Web Content is a structure of the Global site.

	const global = await liferay.get('/o/headless-admin-user/v1.0/sites/by-friendly-url-path/global');
	const structures = await liferay.get(`${DELIVERY}/sites/${global.id}/content-structures?pageSize=200`);
	const basic = (structures.items || []).find((structure) => structure.name === 'Basic Web Content');

	if (!basic) {
		throw new Error('Basic Web Content structure not found');
	}

	return {basicStructureId: basic.id, companyId, siteId: group.id};
}

function articleBody(ctx, article) {
	return {
		contentFields: [{contentFieldValue: {data: readArticle(article)}, name: 'content'}],
		contentStructureId: ctx.basicStructureId,
		externalReferenceCode: article.erc,
		title: article.title,
		viewableBy: 'Anyone',
	};
}

const readArticle = (article) => fs.readFileSync(path.join(__dirname, 'data/site/web-content', article.file), 'utf8').replace(/\r\n/g, '\n').trim();

const articlePath = (ctx, erc) => `${DELIVERY}/sites/${ctx.siteId}/structured-contents/by-external-reference-code/${erc}`;

async function syncArticle(ctx, article) {
	const live = await liferay.get(articlePath(ctx, article.erc));

	if (live && live.title === article.title && live.contentFields[0]?.contentFieldValue?.data?.trim() === readArticle(article)) {
		return 'unchanged';
	}

	await liferay.put(articlePath(ctx, article.erc), articleBody(ctx, article));

	return live ? 'updated' : 'created';
}

const pagePath = (ctx, page) => `${DELIVERY}/sites/${ctx.siteId}/site-pages${page.friendlyUrlPath}?fields=friendlyUrlPath,pageDefinition,pageSettings,title,viewableBy`;

// The widgets on a live page, in order, as names comparable with site.json.

function liveWidgets(pageElement, out = []) {
	for (const child of pageElement?.pageElements || []) {
		const instance = child.definition?.widgetInstance;

		if (instance) {
			out.push(instance.widgetName === JOURNAL_CONTENT ? `${JOURNAL_CONTENT}:${instance.widgetConfig?.articleExternalReferenceCode}` : instance.widgetName);
		}

		liveWidgets(child, out);
	}

	return out;
}

// The widget names site.json expects on a page; Web Content Display widgets carry the article's ERC.

function expectedWidgets(ctx, page) {
	return page.elements.map((element) => (typeof element === 'string' ? customElementWidget(ctx.companyId, element) : `${JOURNAL_CONTENT}:${element.webContent}`));
}

const shortName = (name) => name.replace(/^.*_LXC_/, '').replace(JOURNAL_CONTENT + ':', '');

// A guest's view of the page: the published HTML must contain every custom element and every article's
// ERC-identified content.

async function guestView(ctx, page) {
	const response = await fetch(`${liferay.baseURL}/web${site.site}${page.friendlyUrlPath}`);
	const html = await response.text();
	const missing = [];

	for (const element of page.elements) {
		if (typeof element === 'string') {
			if (!html.includes(`<${element}`)) {
				missing.push(element);
			}
		}
		else {
			const article = site.webContent.find((item) => item.erc === element.webContent);
			const id = readArticle(article).match(/id="([^"]+)"/)[1];

			if (!html.includes(`id="${id}"`)) {
				missing.push(element.webContent);
			}
		}
	}

	return {missing, status: response.status};
}

async function main() {
	const ctx = await context();
	const verifyOnly = process.argv.includes('--verify-only');

	console.log(`Site ${site.site} (id ${ctx.siteId}, company ${ctx.companyId})`);

	if (!verifyOnly) {
		for (const article of site.webContent) {
			console.log(`  ${(await syncArticle(ctx, article)).padEnd(9)} web content ${article.erc}`);
		}
	}

	console.log('\nVerification (GET):');

	const checks = [];

	for (const article of site.webContent) {
		const live = await liferay.get(articlePath(ctx, article.erc));

		checks.push([
			`web content ${article.erc} matches ${article.file}, viewable by anyone`,
			Boolean(live && live.contentFields[0]?.contentFieldValue?.data?.trim() === readArticle(article) && live.title === article.title),
			live ? `key ${live.key}` : 'not found',
		]);
	}

	for (const page of site.pages) {
		const live = await liferay.get(pagePath(ctx, page));
		const widgets = live ? liveWidgets(live.pageDefinition.pageElement) : [];
		const expected = expectedWidgets(ctx, page);

		checks.push([
			`page ${page.friendlyUrlPath} "${page.title}" has its ${expected.length} widgets in order${page.hiddenFromNavigation ? ', hidden from navigation' : ''}`,
			Boolean(live && JSON.stringify(widgets) === JSON.stringify(expected) && Boolean(live.pageSettings?.hiddenFromNavigation) === Boolean(page.hiddenFromNavigation)),
			live ? `${widgets.length} widgets${JSON.stringify(widgets) === JSON.stringify(expected) ? '' : ': ' + widgets.map(shortName).join(', ')}` : 'not found; build it in the UI',
		]);

		const {missing, status} = await guestView(ctx, page);

		checks.push([
			`guest GET /web${site.site}${page.friendlyUrlPath} renders every element`,
			status === 200 && !missing.length,
			`HTTP ${status}${missing.length ? `, missing ${missing.join(', ')}` : ''}`,
		]);
	}

	for (const [label, ok, detail] of checks) {
		console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label} (${detail})`);
	}

	if (checks.some(([, ok]) => !ok)) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
