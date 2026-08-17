/**
 * 校验 release tag 与各版本声明是否一致。
 * Obsidian 按「与 manifest.json 的 version 完全相同的 tag」抓取发布物，
 * 因此 tag 不能带 v 前缀，且 manifest / package / versions.json 三者须同步。
 * versions.json 的值是「装这个插件版本所需的最低 app 版本」，宿主据此决定给
 * 老版本 Obsidian 推送哪个插件版本——它必须与 manifest 的 minAppVersion 相同，
 * 否则宿主会把插件推给一批装不动它的用户。
 * @param {{tag: string, manifestVersion: string, packageVersion: string, minAppVersion?: string, versionsJson: Record<string, string>}} input
 * @returns {{ok: boolean, error?: string}}
 */
export function verifyReleaseTag({
	tag,
	manifestVersion,
	packageVersion,
	minAppVersion,
	versionsJson,
}) {
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
	if (minAppVersion !== undefined && versionsJson[tag] !== minAppVersion) {
		return {
			ok: false,
			error: `versions.json maps "${tag}" to app version "${versionsJson[tag]}", but manifest.json declares minAppVersion "${minAppVersion}".`,
		};
	}
	return { ok: true };
}
