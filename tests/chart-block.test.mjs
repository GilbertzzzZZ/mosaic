import test from "node:test";
import assert from "node:assert/strict";
import { parseChartBlock } from "../src/dataset/chart-block.mjs";

test("parses frontmatter-only block", () => {
	const { attributes, csv } = parseChartBlock(
		'---\ntitle: 示例趋势\ndataset: data/schema/example.dataset.json\ntype: combo\n---\n',
	);
	assert.equal(attributes.title, "示例趋势");
	assert.equal(attributes.dataset, "data/schema/example.dataset.json");
	assert.equal(attributes.type, "combo");
	assert.equal(csv, null);
});

test("parses frontmatter plus csv body", () => {
	const { attributes, csv } = parseChartBlock(
		"---\ntitle: t\nx: month\nseries: a,b\n---\nmonth,a,b\n2025-01,1,2\n",
	);
	assert.equal(attributes.series, "a,b");
	assert.equal(csv, "month,a,b\n2025-01,1,2");
});

test("strips matching surrounding quotes and keeps inner commas", () => {
	const { attributes } = parseChartBlock('---\nnote: "口径, 说明"\nunit: \'%\'\n---');
	assert.equal(attributes.note, "口径, 说明");
	assert.equal(attributes.unit, "%");
});

test("ignores blank lines and # comments in frontmatter", () => {
	const { attributes } = parseChartBlock("---\n# comment\n\ntitle: t\n---");
	assert.deepEqual(attributes, { title: "t" });
});

test("preserves attribute key case", () => {
	const { attributes } = parseChartBlock("---\n钢琴Color: #2563eb\ngranularityOptions: month,quarter\n---");
	assert.equal(attributes["钢琴Color"], "#2563eb");
	assert.equal(attributes.granularityOptions, "month,quarter");
});

test("rejects block without opening ---", () => {
	assert.throws(() => parseChartBlock("title: t\n"), /must start with/);
});

test("rejects unclosed frontmatter", () => {
	assert.throws(() => parseChartBlock("---\ntitle: t\n"), /closing/);
});

test("rejects indented (nested) attribute lines", () => {
	assert.throws(() => parseChartBlock("---\nlabels:\n  position: top\n---"), /flat|indent|no value/i);
});

test("rejects non key-value lines", () => {
	assert.throws(() => parseChartBlock("---\njust text\n---"), /expected key: value/);
});
