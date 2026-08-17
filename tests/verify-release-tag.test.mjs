import assert from "node:assert/strict";
import test from "node:test";

import { verifyReleaseTag } from "../scripts/verify-release-tag.mjs";

const valid = {
	tag: "1.2.3",
	manifestVersion: "1.2.3",
	packageVersion: "1.2.3",
	minAppVersion: "1.5.0",
	versionsJson: { "1.0.0": "1.0.0", "1.2.3": "1.5.0" },
};

test("rejects a tag carrying the v prefix", () => {
	const result = verifyReleaseTag({ ...valid, tag: "v1.2.3" });
	assert.equal(result.ok, false);
	assert.match(result.error, /must be a bare x\.y\.z version/);
});

test("rejects a tag that does not match manifest.json", () => {
	const result = verifyReleaseTag({ ...valid, manifestVersion: "1.2.2" });
	assert.equal(result.ok, false);
	assert.match(result.error, /does not match manifest\.json version "1\.2\.2"/);
});

test("rejects a tag that does not match package.json", () => {
	const result = verifyReleaseTag({ ...valid, packageVersion: "1.2.2" });
	assert.equal(result.ok, false);
	assert.match(result.error, /does not match package\.json version "1\.2\.2"/);
});

test("rejects a tag missing from versions.json", () => {
	const result = verifyReleaseTag({ ...valid, versionsJson: { "1.0.0": "1.0.0" } });
	assert.equal(result.ok, false);
	assert.match(result.error, /versions\.json has no entry for "1\.2\.3"/);
});

// versions.json 的值是宿主用来给老版本 Obsidian 挑插件版本的，与 manifest 的
// minAppVersion 不同就会把插件推给一批装不动它的用户——两处必须同步。
test("rejects a versions.json entry that disagrees with minAppVersion", () => {
	const result = verifyReleaseTag({ ...valid, minAppVersion: "1.13.0" });
	assert.equal(result.ok, false);
	assert.match(result.error, /maps "1\.2\.3" to app version "1\.5\.0".*minAppVersion "1\.13\.0"/);
});

// 省略 minAppVersion 时这条校验跳过，老的调用方不会因此变红。
test("skips the minAppVersion check when it is not supplied", () => {
	const { minAppVersion, ...withoutMinApp } = valid;
	assert.deepEqual(verifyReleaseTag(withoutMinApp), { ok: true });
});

test("accepts a tag consistent across manifest, package and versions.json", () => {
	assert.deepEqual(verifyReleaseTag(valid), { ok: true });
});
