// Ported from 早期内部实现 (（早期内部实现）)
// src/content/table-complexity.mjs, Apache-2.0. See NOTICE. Local changes:
// the complexity/toolbar heuristic (thresholds, dense check, override
// resolution, toolbar derivation) is byte-equivalent to upstream's
// tableComplexityAttributes({rows, columns, cells, overrides}) and lives here
// as the private computeComplexityAttributes(); it is wrapped behind a thin
// tableComplexityAttributes(rows, columns, attributes) adapter that matches
// the interfaces.md contract (Row[] + column-name[] + raw attribute map,
// instead of upstream's pre-counted {rows, columns, cells, overrides}
// object — the two can't share a name with different call shapes, so the
// contract shape wins the export name). Dropped tableCardAttributeString(),
// renderTableToolbar() and their escapeHtml/escapeAttribute helpers: those
// build server-rendered HTML/CSS strings and import 早期内部实现's i18n module,
// out of scope for this pure-function port — Mosaic renders its own React
// toolbar.

const DEFAULTS = {
	complexRows: 20,
	complexColumns: 8,
	complexCells: 100,
	longCellLength: 120,
	searchRows: 100,
	freezeRows: 20,
	freezeColumns: 6,
};

function computeComplexityAttributes({
	rows = 0,
	columns = 0,
	cells = [],
	overrides = {},
} = {}) {
	const rowCount = countValue(rows);
	const columnCount = countValue(columns);
	const cellValues = Array.isArray(cells) ? cells : [];
	const longestCell = cellValues.reduce(
		(max, value) => Math.max(max, String(value ?? "").trim().length),
		0,
	);
	const dense = rowCount > DEFAULTS.complexRows ||
		columnCount >= DEFAULTS.complexColumns ||
		rowCount * columnCount > DEFAULTS.complexCells ||
		longestCell >= DEFAULTS.longCellLength;

	const forcedComplexity = normalizeComplexityOverride(overrides.complexity);
	const complexity = forcedComplexity ?? (dense ? "complex" : "simple");
	const defaultSearch = complexity === "complex" && rowCount > DEFAULTS.searchRows;
	const defaultFreeze = complexity === "complex" &&
		rowCount > DEFAULTS.freezeRows &&
		columnCount >= DEFAULTS.freezeColumns;
	const defaultCopy = complexity === "complex";
	const defaultStickyHeader = complexity === "complex" && rowCount > DEFAULTS.complexRows;

	const search = booleanOverride(overrides.search, defaultSearch);
	const freezeFirstColumn = booleanOverride(
		overrides.freezeFirstColumn ?? overrides.freeze,
		defaultFreeze,
	);
	const copyCsv = booleanOverride(overrides.copyCsv ?? overrides.copy, defaultCopy);
	const stickyHeader = booleanOverride(
		overrides.stickyHeader ?? overrides.sticky,
		defaultStickyHeader,
	);

	return {
		complexity,
		rowCount,
		columnCount,
		toolbar: search || freezeFirstColumn || copyCsv,
		search,
		freezeFirstColumn,
		copyCsv,
		stickyHeader,
	};
}

function countValue(value) {
	if (Array.isArray(value)) {
		return value.length;
	}
	const number = Number(value);
	return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function normalizeComplexityOverride(value) {
	if (value === "simple" || value === "complex") {
		return value;
	}
	return null;
}

function booleanOverride(value, fallback) {
	if (value === true || value === false) {
		return value;
	}
	const normalized = String(value ?? "").trim().toLowerCase();
	if (["true", "1", "yes", "on"].includes(normalized)) {
		return true;
	}
	if (["false", "0", "no", "off"].includes(normalized)) {
		return false;
	}
	return fallback;
}

/**
 * interfaces.md contract:
 * tableComplexityAttributes(rows, columns, attributes) →
 *   {complexity, search, freezeFirstColumn, copyCsv, stickyHeader, toolbar}
 *
 * rows: Row[] (Record<string, string|number>), columns: string[] of column
 * names, attributes: the component's raw attribute map (may carry
 * complexity/search/freeze(FirstColumn)/copy(Csv)/sticky(Header) overrides).
 *
 * All eight fields are produced unconditionally; the return type is left to
 * inference so that renaming a field here breaks DataTableView at compile
 * time.
 *
 * @param {Record<string, string | number>[]} rows
 * @param {string[]} columns
 * @param {Record<string, string>} [attributes]
 */
export function tableComplexityAttributes(rows, columns, attributes = {}) {
	const rowList = Array.isArray(rows) ? rows : [];
	const columnList = Array.isArray(columns) ? columns : [];
	const cells = rowList.flatMap((row) =>
		columnList.map((column) => row?.[column]),
	);
	return computeComplexityAttributes({
		rows: rowList.length,
		columns: columnList.length,
		cells,
		overrides: attributes ?? {},
	});
}
