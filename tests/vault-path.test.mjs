import test from "node:test";
import assert from "node:assert/strict";
import { resolveVaultPath } from "../src/dataset/vault-path.mjs";

test("resolves relative reference against base dir", () => {
	assert.equal(
		resolveVaultPath("reports/2026/07", "../../../data/schema/a.dataset.json"),
		"data/schema/a.dataset.json",
	);
});

test("resolves from vault root when base dir is empty", () => {
	assert.equal(
		resolveVaultPath("", "data/a.dataset.json"),
		"data/a.dataset.json",
	);
});

test("normalises ./ segments", () => {
	assert.equal(resolveVaultPath("a/b", "./c.csv"), "a/b/c.csv");
});

test("rejects escaping the vault root", () => {
	assert.throws(() => resolveVaultPath("a", "../../x.csv"), /escapes/);
});

test("rejects absolute paths and URL schemes", () => {
	assert.throws(() => resolveVaultPath("a", "/etc/passwd"), /relative/);
	assert.throws(() => resolveVaultPath("a", "https://x/y.csv"), /relative/);
});

test("rejects empty and control characters", () => {
	assert.throws(() => resolveVaultPath("a", "  "), /empty/);
	assert.throws(() => resolveVaultPath("a", "b\0c"), /unsupported/i);
});
