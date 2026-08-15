// Table complexity heuristic. The private computeComplexityAttributes() holds
// the whole decision — thresholds, the long-cell density check, override
// resolution and toolbar derivation — over pre-counted
// {rows, columns, cells, overrides}.
// The exported tableComplexityAttributes(rows, columns, attributes) is a thin
// adapter that does the counting and matches the interfaces.md contract
// (Row[] + column names + the component's raw attribute map). Keeping the two
// call shapes in separate functions is deliberate: the contract shape owns the
// export name, the heuristic stays callable on plain counts.
// Nothing here builds markup — the React toolbar renders itself from the
// returned flags.

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
