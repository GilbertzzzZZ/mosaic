import { App, TFile, normalizePath } from "obsidian";
import { parseDatasetManifest, parseDatasetData } from "./dataset-loader.mjs";
import { resolveVaultPath } from "./vault-path.mjs";

function parentDir(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? "" : path.slice(0, i);
}

async function readVaultText(
	app: App,
	path: string,
	label: string,
): Promise<string> {
	const file = app.vault.getAbstractFileByPath(normalizePath(path));
	if (!(file instanceof TFile)) {
		throw new Error(`${label} not found in vault: ${path}`);
	}
	return app.vault.cachedRead(file);
}

export async function loadDatasetForNote(
	app: App,
	notePath: string,
	datasetRef: string,
) {
	const manifestPath = resolveVaultPath(parentDir(notePath), datasetRef);
	if (!manifestPath.endsWith(".dataset.json")) {
		throw new Error(
			`Dataset reference must point to a .dataset.json manifest: ${datasetRef}`,
		);
	}
	const manifest = parseDatasetManifest(
		await readVaultText(app, manifestPath, "Dataset manifest"),
		manifestPath,
	);
	const dataPath = resolveVaultPath(parentDir(manifestPath), manifest.data);
	const rows = parseDatasetData(
		manifest,
		await readVaultText(app, dataPath, "Dataset data file"),
	);
	return { manifest, rows, manifestPath };
}
