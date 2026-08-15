import assert from "node:assert/strict";
import test from "node:test";

import { verifyReleaseTag } from "../scripts/verify-release-tag.mjs";

const valid = {
	tag: "1.2.3",
	manifestVersion: "1.2.3",
	packageVersion: "1.2.3",
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

test("accepts a tag consistent across manifest, package and versions.json", () => {
	assert.deepEqual(verifyReleaseTag(valid), { ok: true });
});
