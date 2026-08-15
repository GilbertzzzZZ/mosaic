import assert from "node:assert/strict";
import test from "node:test";

import { tableComplexityAttributes } from "../src/parse/blocks/table-complexity.mjs";
import { tableLayout } from "../src/parse/blocks/table-layout.mjs";

function rowsOf(count, columns) {
	return Array.from({ length: count }, (_, index) =>
		Object.fromEntries(columns.map((column) => [column, `${column}-${index}`])),
	);
}

// --- table-complexity.mjs -------------------------------------------------

test("complex judgement: rows > 20 alone marks the table complex", () => {
	const columns = ["a", "b"];
	const result = tableComplexityAttributes(rowsOf(21, columns), columns, {});
	assert.equal(result.complexity, "complex");
});

test("complex judgement: columns >= 8 alone marks the table complex", () => {
	const columns = Array.from({ length: 8 }, (_, index) => `c${index}`);
	const result = tableComplexityAttributes(rowsOf(2, columns), columns, {});
	assert.equal(result.complexity, "complex");
});

test("complex judgement: rows*columns > 100 alone marks the table complex", () => {
	const columns = Array.from({ length: 7 }, (_, index) => `c${index}`);
	const rows = rowsOf(15, columns); // 15 rows, 7 columns, 15*7 = 105 > 100
	assert.equal(rows.length <= 20, true);
	assert.equal(columns.length < 8, true);
	const result = tableComplexityAttributes(rows, columns, {});
	assert.equal(result.complexity, "complex");
});

test("complex judgement: longest cell >= 120 chars alone marks the table complex", () => {
	const columns = ["a", "b"];
	const rows = [
		{ a: "short", b: "x".repeat(120) },
		{ a: "short", b: "y" },
	];
	const result = tableComplexityAttributes(rows, columns, {});
	assert.equal(result.complexity, "complex");
});

test("complex judgement: stays simple when no density condition is met", () => {
	const columns = ["a", "b"];
	const rows = rowsOf(3, columns);
	const result = tableComplexityAttributes(rows, columns, {});
	assert.equal(result.complexity, "simple");
});

test("attributes.complexity forces the outcome regardless of density", () => {
	const denseColumns = Array.from({ length: 8 }, (_, index) => `c${index}`);
	const forcedSimple = tableComplexityAttributes(rowsOf(2, denseColumns), denseColumns, {
		complexity: "simple",
	});
	assert.equal(forcedSimple.complexity, "simple");

	const sparseColumns = ["a", "b"];
	const forcedComplex = tableComplexityAttributes(rowsOf(2, sparseColumns), sparseColumns, {
		complexity: "complex",
	});
	assert.equal(forcedComplex.complexity, "complex");
});

test("booleanOverride recognizes the full true/false vocabulary case-insensitively", () => {
	const columns = ["a", "b"];
	const rows = rowsOf(3, columns); // simple table: default search is false

	for (const truthy of ["true", "1", "yes", "on", "TRUE", "On"]) {
		const result = tableComplexityAttributes(rows, columns, { search: truthy });
		assert.equal(result.search, true, `expected "${truthy}" to override to true`);
	}
	for (const falsy of ["false", "0", "no", "off", "FALSE", "No"]) {
		const result = tableComplexityAttributes(rows, columns, { search: falsy });
		assert.equal(result.search, false, `expected "${falsy}" to override to false`);
	}
	// Unrecognized strings fall back to the computed default instead of coercing.
	const fallback = tableComplexityAttributes(rows, columns, { search: "maybe" });
	assert.equal(fallback.search, false);
});

test("toolbar is derived from search || freezeFirstColumn || copyCsv", () => {
	const columns = ["a", "b"];
	const rows = rowsOf(3, columns);

	const none = tableComplexityAttributes(rows, columns, {
		search: false,
		freezeFirstColumn: false,
		copyCsv: false,
	});
	assert.equal(none.toolbar, false);

	const searchOnly = tableComplexityAttributes(rows, columns, {
		search: true,
		freezeFirstColumn: false,
		copyCsv: false,
	});
	assert.equal(searchOnly.toolbar, true);

	const freezeAlias = tableComplexityAttributes(rows, columns, {
		freeze: true,
	});
	assert.equal(freezeAlias.toolbar, true);
	assert.equal(freezeAlias.freezeFirstColumn, true);

	const copyAlias = tableComplexityAttributes(rows, columns, { copy: true });
	assert.equal(copyAlias.toolbar, true);
	assert.equal(copyAlias.copyCsv, true);
});

// --- table-layout.mjs ------------------------------------------------------

test("layout mode: fit for a single narrow column", () => {
	const columns = ["Name"];
	const rows = [{ Name: "Ann" }, { Name: "Bob" }];
	const layout = tableLayout(rows, columns);
	assert.equal(layout.mode, "fit");
	assert.equal(layout.preferredWidth <= 620, true);
});

test("layout mode: wrap once column count exceeds 3, short of scroll thresholds", () => {
	const columns = ["A", "B", "C", "D"];
	const rows = [
		{ A: "aa", B: "bb", C: "cc", D: "dd" },
		{ A: "ee", B: "ff", C: "gg", D: "hh" },
	];
	const layout = tableLayout(rows, columns);
	assert.equal(layout.mode, "wrap");
});

test("layout mode: scroll once column count reaches 8", () => {
	const columns = Array.from({ length: 8 }, (_, index) => `c${index}`);
	const rows = rowsOf(2, columns);
	const layout = tableLayout(rows, columns);
	assert.equal(layout.mode, "scroll");
});

test("layout mode: scroll when summed column minWidth exceeds 920px", () => {
	// "detail" columns (Chinese header keywords) carry a 180px floor each;
	// six of them push minWidth past 920 while staying under the 8-column
	// scroll trigger, exercising the minWidth branch in isolation.
	const columns = ["备注1", "备注2", "备注3", "备注4", "备注5", "备注6"];
	const rows = [
		Object.fromEntries(columns.map((column) => [column, "ok"])),
		Object.fromEntries(columns.map((column) => [column, "fine"])),
	];
	const layout = tableLayout(rows, columns);
	assert.equal(columns.length < 8, true);
	assert.equal(layout.mode, "scroll");
	assert.equal(layout.minWidth > 920, true);
});

test("layout mode: scroll when a hardToken column pushes measured width past 760px", () => {
	const longToken = "长".repeat(45); // visual length 45 >= 42 => hardToken
	const columns = ["TraceId", "说明详情"];
	const rows = [
		{ TraceId: longToken, 说明详情: "这是一段较长的补充说明内容用于撑宽这一列的显示宽度到超过阈值" },
		{ TraceId: longToken, 说明详情: "这是一段较长的补充说明内容用于撑宽这一列的显示宽度到超过阈值" },
	];
	const layout = tableLayout(rows, columns);
	assert.equal(columns.length < 8, true);
	assert.equal(layout.mode, "scroll");
});

test("column classification and width bounds: number/date/detail/hardToken/longText", () => {
	const longToken = "长".repeat(45);
	const longText = "这是一段用于测试的较长文本 内容用来验证自动换行 与列宽扩展显示效果是否达到预期标准结果";
	// "Payload" is deliberately a header that no detail keyword matches: the
	// detail kind is decided before longText, so a detail-flavored name here
	// would silently steal this case's longText coverage.
	const columns = ["Amount", "Date", "备注", "TraceId", "Payload", "Col6", "Col7", "Col8"];
	const row = {
		Amount: "100",
		Date: "2026-01-01",
		备注: "ok",
		TraceId: longToken,
		Payload: longText,
		Col6: "a",
		Col7: "x",
		Col8: "1",
	};
	const rows = [row, { ...row, Amount: "250", Date: "2026-02-15" }];

	const layout = tableLayout(rows, columns);
	assert.equal(layout.mode, "scroll"); // 8 columns => raw px widths, comparable to WIDTHS bounds
	assert.equal(layout.columnWidths.length, 8);

	const px = (value) => Number(value.replace("px", ""));

	// number/date columns always render at their kind's max bound.
	assert.equal(px(layout.columnWidths[0]), 108); // Amount -> number, WIDTHS.number.max
	assert.equal(px(layout.columnWidths[1]), 132); // Date -> date, WIDTHS.date.max

	// 备注 header keyword forces the "detail" kind: [180, 420].
	const detailWidth = px(layout.columnWidths[2]);
	assert.equal(detailWidth >= 180 && detailWidth <= 420, true);

	// TraceId's 45-char CJK token forces "hardToken": [180, 560].
	const hardTokenWidth = px(layout.columnWidths[3]);
	assert.equal(hardTokenWidth >= 180 && hardTokenWidth <= 560, true);

	// Payload's long, multi-token text forces "longText": [176, 520].
	const longTextWidth = px(layout.columnWidths[4]);
	assert.equal(longTextWidth >= 176 && longTextWidth <= 520, true);
});

// 短取值确保不被 longText/hardToken 分支抢先命中，minWidth 即列型判定结果。
function detailFloorOf(header) {
	const rows = [{ [header]: "ok" }, { [header]: "fine" }];
	return tableLayout(rows, [header]).minWidth;
}

test("detail column: English header keywords map to the detail kind", () => {
	for (const header of [
		"Description", "Details", "Explanation", "Instructions", "Comments",
		"Remarks", "Notes", "Summary", "Context", "Rationale", "Justification",
		"Basis", "Criteria", "Definition", "Methodology", "Formula",
		"Calculation", "Rules", "Reason", "Root Cause", "Data Source",
		"Origin", "Path",
	]) {
		assert.equal(detailFloorOf(header), 180, `expected "${header}" to be a detail column`);
	}
});

// 单复数均命中是刻意的：中文词表里「备注」同样不分单复数。
test("detail column: singular and plural forms both match", () => {
	for (const header of ["Note", "Rule", "Detail", "Reason", "Comment"]) {
		assert.equal(detailFloorOf(header), 180, `expected "${header}" to be a detail column`);
	}
});

test("detail column: English keyword matching is case-insensitive", () => {
	for (const header of ["description", "NOTES", "remarks", "rATIONALE"]) {
		assert.equal(detailFloorOf(header), 180, `expected "${header}" to be a detail column`);
	}
});

test("detail column: Chinese header keywords still map to the detail kind", () => {
	for (const header of [
		"口径", "路径", "说明", "备注", "描述", "来源",
		"依据", "公式", "计算", "规则", "原因",
	]) {
		assert.equal(detailFloorOf(header), 180, `expected "${header}" to be a detail column`);
	}
});

test("detail column: word boundaries keep look-alike headers out", () => {
	for (const header of [
		"Ruler", "Resource", "Original", "Sympathy", "Pathology", "Pathway",
		"Method", "Policy", "Reference", "Species", "Calcium", "Seasonal",
	]) {
		assert.notEqual(detailFloorOf(header), 180, `expected "${header}" NOT to be a detail column`);
	}
});

test("detail column: English keywords in cell values also trigger the detail kind", () => {
	const lineage = [{ Layer: "source table" }, { Layer: "snapshot" }];
	assert.equal(tableLayout(lineage, ["Layer"]).minWidth, 180);
	const neutral = [{ Layer: "raw" }, { Layer: "curated" }];
	assert.notEqual(tableLayout(neutral, ["Layer"]).minWidth, 180);
});

// 详情列的 minWidth 下限 180 会推高整表 minWidth，而 minWidth > 920 触发
// scroll 模式。这个阈值行为是本次改动最可见的 UI 变化，用例守住它。
test("detail column: enough English detail columns flips the table to scroll mode", () => {
	const wide = ["Name", "Description", "Source", "Notes", "Comments", "Reason"];
	const row = Object.fromEntries(wide.map((c) => [c, "ok"]));
	assert.equal(tableLayout([row, row], wide).mode, "scroll");
	const narrow = wide.slice(0, 5);
	const narrowRow = Object.fromEntries(narrow.map((c) => [c, "ok"]));
	assert.notEqual(tableLayout([narrowRow, narrowRow], narrow).mode, "scroll");
});
