import test from "node:test";
import assert from "node:assert/strict";
import { parseBlockSource } from "../src/parse/block-source.mjs";

test("parses frontmatter-only block", () => {
	const { attributes, body, unrecognized } = parseBlockSource(
		'---\ntitle: Sample trend\ndataset: data/schema/example.dataset.json\ntype: combo\n---\n',
	);
	assert.equal(attributes.title, "Sample trend");
	assert.equal(attributes.dataset, "data/schema/example.dataset.json");
	assert.equal(attributes.type, "combo");
	assert.equal(body, null);
	assert.deepEqual(unrecognized, []);
});

test("parses frontmatter plus an inline body", () => {
	const { attributes, body } = parseBlockSource(
		"---\ntitle: t\nx: month\nseries: a,b\n---\nmonth,a,b\n2025-01,1,2\n",
	);
	assert.equal(attributes.series, "a,b");
	assert.equal(body, "month,a,b\n2025-01,1,2");
});

test("the body field carries JSON and fenced payloads verbatim, not just CSV", () => {
	// 名字从 csv 改成 body 的理由：六类共用之后，同一个字段在 FlowDiagram 里装的是
	// JSON 对象，在 Timeline / DecisionBox 里装的是带围栏的 payload。
	const flow = parseBlockSource(
		'---\ntitle: f\n---\n```json\n{"nodes":[{"id":"a","label":"A"}]}\n```',
	);
	assert.equal(flow.body, '```json\n{"nodes":[{"id":"a","label":"A"}]}\n```');
	const timeline = parseBlockSource("---\ntitle: t\n---\n```csv\ndate,title\n2026-01,a\n```");
	assert.equal(timeline.body, "```csv\ndate,title\n2026-01,a\n```");
});

test("strips matching surrounding quotes and keeps inner commas", () => {
	const { attributes } = parseBlockSource('---\nnote: "Scope, notes"\nunit: \'%\'\n---');
	assert.equal(attributes.note, "Scope, notes");
	assert.equal(attributes.unit, "%");
});

test("ignores blank lines and # comments in frontmatter", () => {
	const { attributes, unrecognized } = parseBlockSource("---\n# comment\n\ntitle: t\n---");
	assert.deepEqual(attributes, { title: "t" });
	assert.deepEqual(unrecognized, []);
});

test("preserves attribute key case", () => {
	const { attributes } = parseBlockSource("---\n示例Color: #2563eb\ngranularityOptions: month,quarter\n---");
	assert.equal(attributes["示例Color"], "#2563eb");
	assert.equal(attributes.granularityOptions, "month,quarter");
});

// --- ⚠️ 结构边界：这两条不放宽 ---

test("rejects block without opening ---", () => {
	assert.throws(() => parseBlockSource("title: t\n"), /must start with/);
});

test("rejects unclosed frontmatter", () => {
	// 缺了闭合 ---，body 与属性区分不开，尽力解析只会得到面目全非的结果。
	assert.throws(() => parseBlockSource("---\ntitle: t\n"), /closing/);
	// 后面真的有 body 时同样报错，不能把 body 当成属性行读掉
	assert.throws(
		() => parseBlockSource("---\ntitle: t\nmonth,v\n2026-01,1\n"),
		/closing/,
	);
});

// --- Task 4：写歪的属性行进 unrecognized，不再整块作废 ---

test("an indented line is collected instead of failing the whole block", () => {
	const { attributes, unrecognized } = parseBlockSource(
		"---\ntype: line\nlabels:\n  position: top\n---\nmonth,v\n2026-01,1",
	);
	// 认得的那些照常解析出来，图才出得来
	assert.deepEqual(attributes, { type: "line" });
	// 写歪的两行都被点名：`labels:` 值为空，`  position: top` 有缩进
	assert.deepEqual(unrecognized, ["labels:", "position: top"]);
});

test("a line that is not key: value is collected, not thrown", () => {
	const { attributes, unrecognized } = parseBlockSource(
		"---\ntype: line\njust text\n---",
	);
	assert.deepEqual(attributes, { type: "line" });
	assert.deepEqual(unrecognized, ["just text"]);
});

test("an attribute with no value is collected, not thrown", () => {
	const { attributes, unrecognized } = parseBlockSource("---\ntype: line\nunit:\n---");
	assert.deepEqual(attributes, { type: "line" });
	assert.deepEqual(unrecognized, ["unit:"]);
});

test("a section where nothing parses at all is still rejected whole", () => {
	// 一条属性都没认出来 ≠ 有几条写歪了：这压根不是一个属性区。
	assert.throws(() => parseBlockSource("---\njust text\n---"), /No attribute could be read/);
	assert.throws(
		() => parseBlockSource("---\nlabels:\n  position: top\n---"),
		/No attribute could be read/,
	);
	// 报错点名了那几行，用户知道该改哪里
	assert.throws(() => parseBlockSource("---\njust text\n---"), /just text/);
});

test("an empty attribute section is not an error — there is nothing written wrong", () => {
	const { attributes, unrecognized, body } = parseBlockSource("---\n---\nmonth,v\n2026-01,1");
	assert.deepEqual(attributes, {});
	assert.deepEqual(unrecognized, []);
	assert.equal(body, "month,v\n2026-01,1");
});
