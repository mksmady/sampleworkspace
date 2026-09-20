/**
 * Walks the metadata directories Liferay mounts at deploy time
 * (LIFERAY_ROUTES_CLIENT_EXTENSION / LIFERAY_ROUTES_DXP) and merges the
 * files it finds into config, keyed by filename. This is how
 * com.liferay.lxc.dxp.* values and OAuth2 client credentials reach this
 * service without ever being committed to source control.
 */

import fs from 'fs';
import path from 'path';

import config from '../config.js';

async function* walk(dir) {
	if (fs.existsSync(dir) === false) {
		return;
	}

	const dirents = await fs.promises.opendir(dir, {
		withFileTypes: true,
	});

	for await (const dirent of dirents) {
		if (dirent.name.startsWith('..')) {
			continue;
		}

		const entryPath = path.join(dir, dirent.name);

		if (dirent.isDirectory()) {
			yield* walk(entryPath);
		}
		else {
			yield entryPath;
		}
	}
}

const configTreeMap = async () => {
	for (const configTreePath of config.configTreePaths) {
		for await (const configFile of walk(configTreePath)) {
			const configFileName = configFile.substring(
				configFile.lastIndexOf('/') + 1
			);

			config[configFileName] = fs.readFileSync(configFile, 'utf-8');
		}
	}

	return config;
};

export default await configTreeMap();
