import test from "node:test";
import assert from "node:assert/strict";
import { findChartTags, isOnlyChartTags } from "../src/dataset/chart-tag.mjs";

const realTag = `<Chart
  title="一起练琴活跃付费率趋势"
  dataset="../../../mango-da/data/violy/schema/monthly-active-paid-rate.dataset.json"
  type="line"
  x="period"
  series="活跃付费率,钢琴,小提琴"
  unit="%"
  labels="all"
  from="2024-07-01"
  to="2026-07-01"
  granularity="month"
  granularityOptions="month,quarter"
  note="活跃付费率 = 付费用户 / 活跃用户；季度视图为三个月比率的算术平均。"
/>`;

test("parses a real multi-line tag with case preserved", () => {
	const tags = findChartTags(realTag);
	assert.equal(tags.length, 1);
	const a = tags[0].attributes;
	assert.equal(a.granularityOptions, "month,quarter"); // 大小写保留
	assert.equal(a.series, "活跃付费率,钢琴,小提琴");
	assert.equal(a.note.includes("付费用户 / 活跃用户"), true); // 值内斜杠不截断
	assert.equal(tags[0].start, 0);
	assert.equal(tags[0].end, realTag.length);
});

test("finds multiple tags and records spans", () => {
	const text = `${realTag}\n\n<Chart title="b" dataset="s/b.dataset.json" type="bar" x="period" series="v" />`;
	const tags = findChartTags(text);
	assert.equal(tags.length, 2);
	assert.equal(tags[1].attributes.title, "b");
});

test("ignores text without tags and unterminated tags", () => {
	assert.equal(findChartTags("plain paragraph").length, 0);
	assert.equal(findChartTags('<Chart title="x"').length, 0);
});

test("does not match ChartFoo or lowercase chart", () => {
	assert.equal(findChartTags('<ChartFoo x="1" />').length, 0);
	assert.equal(findChartTags('<chart x="1" />').length, 0);
});

test("isOnlyChartTags accepts tags plus whitespace only", () => {
	const solo = findChartTags(realTag);
	assert.equal(isOnlyChartTags(realTag, solo), true);
	const mixed = `before\n${realTag}`;
	assert.equal(isOnlyChartTags(mixed, findChartTags(mixed)), false);
});

test("does not swallow prose into an unterminated tag with a stray closer", () => {
	const text = `<Chart title="x"\n\nsome unrelated paragraph ending with />\n\nmore content after`;
	assert.equal(findChartTags(text).length, 0);
});

const PAIRED = `<Chart title="示例" type="line" x="month" series="a,b">
\`\`\`csv
month,a,b
2025-01,120,80
\`\`\`
</Chart>`;

test("finds a paired tag with csv payload", () => {
	const tags = findChartTags(PAIRED);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].attributes.title, "示例");
	assert.equal(tags[0].csv, "month,a,b\n2025-01,120,80");
	assert.equal(tags[0].start, 0);
	assert.equal(tags[0].end, PAIRED.length);
});

test("self-closing tags report csv null", () => {
	const tags = findChartTags('<Chart dataset="a.dataset.json" />');
	assert.equal(tags.length, 1);
	assert.equal(tags[0].csv, null);
});

test("paired fence language tag is optional", () => {
	const bare = PAIRED.replace("```csv", "```");
	assert.equal(findChartTags(bare)[0].csv, "month,a,b\n2025-01,120,80");
});

test("paired body without a fence is rejected", () => {
	const noFence = `<Chart title="t">\nmonth,a\n2025-01,1\n</Chart>`;
	assert.deepEqual(findChartTags(noFence), []);
});

test("unclosed paired tag is rejected", () => {
	assert.deepEqual(findChartTags('<Chart title="t">\n```csv\nm,a\n```\n'), []);
});

test("mixed section finds both forms and isOnlyChartTags accepts it", () => {
	const text = `<Chart dataset="a.dataset.json" />\n\n${PAIRED}`;
	const tags = findChartTags(text);
	assert.equal(tags.length, 2);
	assert.equal(tags[0].csv, null);
	assert.ok(tags[1].csv.includes("month,a,b"));
	assert.ok(isOnlyChartTags(text, tags));
});

test("open tag with non-attribute inner content is rejected", () => {
	assert.deepEqual(findChartTags('<Chart title="t" junk>\n```csv\nm,a\n1,2\n```\n</Chart>'), []);
});

test("paired open tag accepts one attribute per line", () => {
	const multiline = `<Chart
	title="成对标签"
	type="combo"
	x="month"
	bars="指标A"
	lines="指标B"
>
\`\`\`csv
month,指标A,指标B
2025-01,120,80
\`\`\`
</Chart>`;
	const tags = findChartTags(multiline);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].attributes.title, "成对标签");
	assert.equal(tags[0].attributes.bars, "指标A");
	assert.equal(tags[0].csv, "month,指标A,指标B\n2025-01,120,80");
});
