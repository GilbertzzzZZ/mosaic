/**
 * 校验 release tag 与各版本声明是否一致。
 * Obsidian 按「与 manifest.json 的 version 完全相同的 tag」抓取发布物，
 * 因此 tag 不能带 v 前缀，且 manifest / package / versions.json 三者须同步。
 * @param {{tag: string, manifestVersion: string, packageVersion: string, versionsJson: Record<string, string>}} input
 * @returns {{ok: boolean, error?: string}}
 */
export function verifyReleaseTag({ tag, manifestVersion, packageVersion, versionsJson }) {
	if (!/^\d+\.\d+\.\d+$/.test(tag)) {
		return { ok: false, error: `Tag "${tag}" must be a bare x.y.z version with no "v" prefix.` };
	}
	if (tag !== manifestVersion) {
		return { ok: false, error: `Tag "${tag}" does not match manifest.json version "${manifestVersion}".` };
	}
	if (tag !== packageVersion) {
		return { ok: false, error: `Tag "${tag}" does not match package.json version "${packageVersion}".` };
	}
	if (!Object.prototype.hasOwnProperty.call(versionsJson, tag)) {
		return { ok: false, error: `versions.json has no entry for "${tag}"; add it with the minimum supported app version.` };
	}
	return { ok: true };
}
