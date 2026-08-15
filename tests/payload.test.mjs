import assert from "node:assert/strict";
import test from "node:test";

import {
	extractDataBlock,
	extractRows,
	parseCell,
	listAttribute,
	uniqueStrings,
	normalizeStatus,
	normalizeDecisionStatus,
	normalizeMetricStatus,
	normalizeFlowType,
	parseRichBlocks,
	parseInlineText,
	timelineItem,
	metricItem,
	decisionItems,
} from "../src/parse/blocks/payload.mjs";

// --- extractDataBlock -------------------------------------------------

test("extractDataBlock: fenced block with no language tag defaults to csv", () => {
	const block = extractDataBlock("```\na,b\n1,2\n```");
	assert.deepEqual(block, { format: "csv", body: "a,b\n1,2" });
});

test("extractDataBlock: fenced tsv block", () => {
	const block = extractDataBlock("```tsv\na\tb\n1\t2\n```");
	assert.deepEqual(block, { format: "tsv", body: "a\tb\n1\t2" });
});

test("extractDataBlock: fenced json block", () => {
	const block = extractDataBlock('```json\n[{"a":1}]\n```');
	assert.deepEqual(block, { format: "json", body: '[{"a":1}]' });
});

test("extractDataBlock: unrelated language tag is preserved verbatim (degrades to csv later, not here)", () => {
	const block = extractDataBlock("```python\na,b\n1,2\n```");
	assert.deepEqual(block, { format: "python", body: "a,b\n1,2" });
});

test("extractDataBlock: returns null when content is not a single fenced block", () => {
	assert.equal(extractDataBlock("a,b\n1,2"), null);
	assert.equal(extractDataBlock("```csv\na,b\n1,2\n```\ntrailing text"), null);
});

// --- extractRows: four dispatch paths ---------------------------------

test("extractRows: fenced json path", () => {
	const rows = extractRows('```json\n[{"a":"1"}]\n```');
	assert.deepEqual(rows, [{ a: "1" }]);
});

test("extractRows: fenced tsv path", () => {
	const rows = extractRows("```tsv\na\tb\n1\t2\n```");
	assert.deepEqual(rows, [{ a: 1, b: 2 }]);
});

test("extractRows: fenced unrelated language tag degrades to csv", () => {
	const rows = extractRows("```python\na,b\n1,2\n```");
	assert.deepEqual(rows, [{ a: 1, b: 2 }]);
});

test("extractRows: bare content starting with [ is parsed as JSON", () => {
	const rows = extractRows('[{"a":1}]');
	assert.deepEqual(rows, [{ a: 1 }]);
});

test("extractRows: bare content starting with { is parsed as JSON (rows wrapper)", () => {
	const rows = extractRows('{"rows":[{"a":1}]}');
	assert.deepEqual(rows, [{ a: 1 }]);
});

test("extractRows: bare content containing | is parsed as a markdown table", () => {
	const rows = extractRows("| a | b |\n| --- | --- |\n| 1 | 2 |");
	assert.deepEqual(rows, [{ a: 1, b: 2 }]);
});

test("extractRows: bare content falls back to CSV", () => {
	const rows = extractRows("a,b\n1,2");
	assert.deepEqual(rows, [{ a: 1, b: 2 }]);
});

// --- rowsFromJson (via extractRows) ------------------------------------

test("rowsFromJson: array top-level", () => {
	assert.deepEqual(extractRows('```json\n[{"x":1},{"x":2}]\n```'), [{ x: 1 }, { x: 2 }]);
});

test("rowsFromJson: object with rows top-level", () => {
	assert.deepEqual(extractRows('```json\n{"rows":[{"x":1}]}\n```'), [{ x: 1 }]);
});

test("rowsFromJson: non-array rows field yields empty array", () => {
	assert.deepEqual(extractRows('```json\n{"rows":"nope"}\n```'), []);
});

test("rowsFromJson: non-object array items are silently dropped", () => {
	assert.deepEqual(extractRows('```json\n[{"x":1},"skip",null,42]\n```'), [{ x: 1 }]);
});

// --- rowsFromMarkdownTable (via extractRows) ---------------------------

test("rowsFromMarkdownTable: separator row is skipped unconditionally", () => {
	const rows = extractRows("| a | b |\n| :-- | --: |\n| 1 | 2 |\n| 3 | 4 |");
	assert.deepEqual(rows, [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
});

test("rowsFromMarkdownTable: fewer than header+separator+1 data row yields empty array", () => {
	assert.deepEqual(extractRows("| a | b |\n| --- | --- |"), []);
});

// --- delimited: empty-row filtering -------------------------------------

test("extractRows: fully blank delimited rows are filtered out", () => {
	const rows = extractRows("a,b\n1,2\n,\n3,4");
	assert.deepEqual(rows, [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
});

test("extractRows: header-only delimited content yields empty array", () => {
	assert.deepEqual(extractRows("a,b"), []);
});

// --- parseCell strict numeric regex -------------------------------------

test("parseCell: plain integer becomes a number", () => {
	assert.equal(parseCell("42"), 42);
});

test("parseCell: decimal becomes a number", () => {
	assert.equal(parseCell("3.5"), 3.5);
});

test("parseCell: negative number becomes a number", () => {
	assert.equal(parseCell("-7"), -7);
});

test("parseCell: thousand-separated value stays a string", () => {
	assert.equal(parseCell("1,234"), "1,234");
});

test("parseCell: percent-suffixed value stays a string", () => {
	assert.equal(parseCell("50%"), "50%");
});

test("parseCell: empty string stays empty string", () => {
	assert.equal(parseCell(""), "");
});

test("parseCell: whitespace-only trims to empty string", () => {
	assert.equal(parseCell("   "), "");
});

test("parseCell: non-numeric text stays a string", () => {
	assert.equal(parseCell("2026-01-01"), "2026-01-01");
});

// --- listAttribute / uniqueStrings --------------------------------------

test("listAttribute: comma-separated string is split, trimmed, and empties dropped", () => {
	assert.deepEqual(listAttribute(" a, b ,,c"), ["a", "b", "c"]);
});

test("listAttribute: falsy input yields empty array", () => {
	assert.deepEqual(listAttribute(undefined), []);
	assert.deepEqual(listAttribute(""), []);
});

test("uniqueStrings: dedupes, trims, drops empties", () => {
	assert.deepEqual(uniqueStrings(["a", " a ", "", "b", null, undefined]), ["a", "b"]);
});

// --- normalizeStatus (Timeline) -----------------------------------------

test("normalizeStatus: done bucket", () => {
	for (const v of ["done", "complete", "completed", "success"]) {
		assert.equal(normalizeStatus(v), "done");
	}
});

test("normalizeStatus: blocked bucket", () => {
	for (const v of ["blocked", "risk", "warning"]) {
		assert.equal(normalizeStatus(v), "blocked");
	}
});

test("normalizeStatus: active bucket", () => {
	for (const v of ["active", "doing", "progress", "in-progress"]) {
		assert.equal(normalizeStatus(v), "active");
	}
});

test("normalizeStatus: unrecognized value and empty value fall back to default", () => {
	assert.equal(normalizeStatus("mystery"), "default");
	assert.equal(normalizeStatus(""), "default");
	assert.equal(normalizeStatus(undefined), "default");
});

test("normalizeStatus: case-insensitive and trims whitespace", () => {
	assert.equal(normalizeStatus(" DONE "), "done");
});

// --- normalizeDecisionStatus (DecisionBox) -------------------------------

test("normalizeDecisionStatus: canonical values pass through", () => {
	for (const v of ["accepted", "proposed", "rejected", "superseded"]) {
		assert.equal(normalizeDecisionStatus(v), v);
	}
});

test("normalizeDecisionStatus: done-family maps to accepted", () => {
	for (const v of ["done", "complete", "completed"]) {
		assert.equal(normalizeDecisionStatus(v), "accepted");
	}
});

test("normalizeDecisionStatus: other non-empty values become default", () => {
	assert.equal(normalizeDecisionStatus("mystery"), "default");
});

test("normalizeDecisionStatus: empty/undefined returns empty string", () => {
	assert.equal(normalizeDecisionStatus(""), "");
	assert.equal(normalizeDecisionStatus(undefined), "");
});

// --- normalizeMetricStatus (MetricGrid) ----------------------------------

test("normalizeMetricStatus: good bucket", () => {
	for (const v of ["good", "up", "positive", "success", "active"]) {
		assert.equal(normalizeMetricStatus(v), "good");
	}
});

test("normalizeMetricStatus: risk bucket", () => {
	for (const v of ["risk", "warning", "blocked", "down", "negative"]) {
		assert.equal(normalizeMetricStatus(v), "risk");
	}
});

test("normalizeMetricStatus: watch bucket", () => {
	for (const v of ["watch", "flat", "neutral"]) {
		assert.equal(normalizeMetricStatus(v), "watch");
	}
});

test("normalizeMetricStatus: plus-prefix fallback yields good", () => {
	assert.equal(normalizeMetricStatus("+3%"), "good");
});

test("normalizeMetricStatus: minus-prefix fallback yields risk", () => {
	assert.equal(normalizeMetricStatus("-3%"), "risk");
});

test("normalizeMetricStatus: unrecognized value falls back to neutral", () => {
	assert.equal(normalizeMetricStatus("mystery"), "neutral");
	assert.equal(normalizeMetricStatus(""), "neutral");
});

// --- normalizeFlowType (FlowDiagram) -------------------------------------

test("normalizeFlowType: canonical values pass through", () => {
	for (const v of ["start", "end", "decision", "gate", "risk", "action"]) {
		assert.equal(normalizeFlowType(v), v);
	}
});

test("normalizeFlowType: warning/blocked/error map to risk", () => {
	for (const v of ["warning", "blocked", "error"]) {
		assert.equal(normalizeFlowType(v), "risk");
	}
});

test("normalizeFlowType: question/branch/condition map to decision", () => {
	for (const v of ["question", "branch", "condition"]) {
		assert.equal(normalizeFlowType(v), "decision");
	}
});

test("normalizeFlowType: empty/undefined defaults to action", () => {
	assert.equal(normalizeFlowType(""), "action");
	assert.equal(normalizeFlowType(undefined), "action");
});

test("normalizeFlowType: unrecognized value falls back to action", () => {
	assert.equal(normalizeFlowType("mystery"), "action");
});

// --- parseRichBlocks (DecisionBox rich-text fallback, parse half) -------

test("parseRichBlocks: single paragraph of consecutive lines", () => {
	const blocks = parseRichBlocks("line one\nline two");
	assert.deepEqual(blocks, [{ type: "p", lines: ["line one", "line two"] }]);
});

test("parseRichBlocks: bullet list lines (- and *) become a ul block", () => {
	const blocks = parseRichBlocks("- first\n* second");
	assert.deepEqual(blocks, [{ type: "ul", lines: ["first", "second"] }]);
});

test("parseRichBlocks: blank line flushes paragraph and list, mixed content", () => {
	const blocks = parseRichBlocks("intro line\n\n- item a\n- item b\n\nclosing line");
	assert.deepEqual(blocks, [
		{ type: "p", lines: ["intro line"] },
		{ type: "ul", lines: ["item a", "item b"] },
		{ type: "p", lines: ["closing line"] },
	]);
});

test("parseRichBlocks: strips a fenced block only when the language tag is in the text whitelist", () => {
	for (const lang of ["md", "markdown", "text", "txt"]) {
		const blocks = parseRichBlocks("```" + lang + "\nhello\n```");
		assert.deepEqual(blocks, [{ type: "p", lines: ["hello"] }]);
	}
});

test("parseRichBlocks: fenced block with a non-whitelisted language tag is treated as plain content, fence lines included", () => {
	const blocks = parseRichBlocks("```csv\na,b\n```");
	assert.deepEqual(blocks, [{ type: "p", lines: ["```csv", "a,b", "```"] }]);
});

test("parseRichBlocks: empty content yields no blocks", () => {
	assert.deepEqual(parseRichBlocks(""), []);
	assert.deepEqual(parseRichBlocks("   "), []);
});

// --- parseInlineText (code/bold lexing, parse half) ----------------------

test("parseInlineText: plain text with no markup", () => {
	assert.deepEqual(parseInlineText("hello world"), [{ type: "text", text: "hello world" }]);
});

test("parseInlineText: inline code span", () => {
	assert.deepEqual(parseInlineText("run `npm test` now"), [
		{ type: "text", text: "run " },
		{ type: "code", text: "npm test" },
		{ type: "text", text: " now" },
	]);
});

test("parseInlineText: bold span", () => {
	assert.deepEqual(parseInlineText("this is **important** text"), [
		{ type: "text", text: "this is " },
		{ type: "bold", text: "important" },
		{ type: "text", text: " text" },
	]);
});

test("parseInlineText: mixed code and bold in one string", () => {
	assert.deepEqual(parseInlineText("**bold** and `code` mixed"), [
		{ type: "bold", text: "bold" },
		{ type: "text", text: " and " },
		{ type: "code", text: "code" },
		{ type: "text", text: " mixed" },
	]);
});

test("parseInlineText: empty string yields no tokens", () => {
	assert.deepEqual(parseInlineText(""), []);
});

// --- timelineItem (§3.3 alias chain) -------------------------------------

test("timelineItem: primary field names", () => {
	const item = timelineItem({ status: "done", date: "2026-01-01", title: "Launch", body: "Shipped", owner: "alice" });
	assert.deepEqual(item, { status: "done", date: "2026-01-01", title: "Launch", body: "Shipped", owner: "alice" });
});

test("timelineItem: alias chain fallbacks (time/month, name/event, description/summary/note, assignee)", () => {
	const item = timelineItem({ status: "blocked", time: "2026-02-01", name: "Review", summary: "At risk", assignee: "bob" });
	assert.deepEqual(item, { status: "blocked", date: "2026-02-01", title: "Review", body: "At risk", owner: "bob" });
});

test("timelineItem: missing fields default to empty string, status defaults", () => {
	const item = timelineItem({});
	assert.deepEqual(item, { status: "default", date: "", title: "", body: "", owner: "" });
});

// --- metricItem (§5.3 alias chain) ---------------------------------------

test("metricItem: primary field names", () => {
	const item = metricItem({ label: "MAU", value: "1.2万", delta: "+5%", note: "同比增长", status: "good" });
	assert.deepEqual(item, { label: "MAU", value: "1.2万", delta: "+5%", note: "同比增长", status: "good" });
});

test("metricItem: alias chain fallbacks (metric/name/title, current/amount/count, change/mom/yoy, description/source/body)", () => {
	const item = metricItem({ metric: "Retention", current: "42%", change: "-3%", source: "survey" });
	assert.deepEqual(item, { label: "Retention", value: "42%", delta: "-3%", note: "survey", status: "risk" });
});

test("metricItem: status falls back through trend/delta/change when status is absent", () => {
	assert.equal(metricItem({ trend: "watch" }).status, "watch");
	assert.equal(metricItem({ delta: "+2" }).status, "good");
	assert.equal(metricItem({ change: "-2" }).status, "risk");
});

test("metricItem: missing fields default to empty string / neutral status", () => {
	const item = metricItem({});
	assert.deepEqual(item, { label: "", value: "", delta: "", note: "", status: "neutral" });
});

// --- decisionItems (§4.3 path A alias chain + filter) --------------------

test("decisionItems: primary field names", () => {
	assert.deepEqual(decisionItems([{ label: "决策", value: "采用方案 A" }]), [{ label: "决策", value: "采用方案 A" }]);
});

test("decisionItems: alias chain fallbacks (key/name/item, text/body/description/summary)", () => {
	assert.deepEqual(decisionItems([{ name: "代价", text: "迁移成本约两周" }]), [{ label: "代价", value: "迁移成本约两周" }]);
});

test("decisionItems: rows where both label and value are empty are filtered out", () => {
	assert.deepEqual(decisionItems([{ label: "kept", value: "" }, {}, { label: "", value: "also kept" }]), [
		{ label: "kept", value: "" },
		{ label: "", value: "also kept" },
	]);
});

test("decisionItems: empty rows array yields empty array", () => {
	assert.deepEqual(decisionItems([]), []);
});
