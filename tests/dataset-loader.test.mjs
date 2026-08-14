import test from "node:test";
import assert from "node:assert/strict";
import {
	parseDatasetManifest,
	parseDatasetData,
} from "../src/dataset/dataset-loader.mjs";

const manifestText = JSON.stringify({
	schemaVersion: 1,
	id: "t-monthly",
	data: "./t.csv",
	grain: ["AnchorDate"],
	primaryKey: ["AnchorDate"],
	time: { field: "AnchorDate", sourceGranularity: "month" },
	fields: [
		{ name: "AnchorDate", type: "date", required: true },
		{ name: "总量", type: "integer", required: true, rollup: "avg" },
		{
			name: "拆分",
			type: "integer",
			required: true,
			rollup: "avg",
			numberFormat: "comma-grouped",
		},
	],
});

test("parseDatasetManifest accepts a valid manifest", () => {
	const manifest = parseDatasetManifest(manifestText);
	assert.equal(manifest.id, "t-monthly");
	assert.equal(manifest.time.sourceGranularity, "month");
});

test("parseDatasetManifest rejects unknown keys", () => {
	const bad = JSON.stringify({ ...JSON.parse(manifestText), extra: 1 });
	assert.throws(() => parseDatasetManifest(bad), /extra/);
});

test("parseDatasetData types rows and honours comma-grouped", () => {
	const manifest = parseDatasetManifest(manifestText);
	const rows = parseDatasetData(
		manifest,
		'AnchorDate,总量,拆分\n2026-02-01,20,"1,234"\n2026-01-01,10,4\n',
	);
	assert.equal(rows.length, 2);
	assert.equal(rows[0]["拆分"], 1234);
});

test("parseDatasetData rejects misaligned period start", () => {
	const manifest = parseDatasetManifest(manifestText);
	assert.throws(
		() => parseDatasetData(manifest, "AnchorDate,总量,拆分\n2026-01-15,10,4\n"),
		/first day of a month/i,
	);
});
