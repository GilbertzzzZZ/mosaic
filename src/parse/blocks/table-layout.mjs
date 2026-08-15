// Ported from 早期内部实现 (（早期内部实现）)
// src/content/table-layout.mjs, Apache-2.0. See NOTICE. Local changes: the
// column classification/sizing algorithm (WIDTHS, columnLayout, columnKind,
// widthForKind and every private helper below) and the layout-mode decision
// in tableLayoutAttributes() are byte-equivalent to upstream, with one
// exception: isDetailColumn() keeps upstream's shape but no longer inlines
// upstream's Chinese-only keyword literals — it reads them from
// ./detail-keywords.mjs, a Mosaic-owned module that also covers English
// detail-column names.
// Dropped tableScrollAttributeString(), tableLayoutStyleString() and
// renderTableColgroup(): those build server-rendered HTML/CSS attribute
// strings, out of scope for this pure-function port — Mosaic's React table
// view owns its own markup. renderTableColgroup's own per-column CSS-width
// formula (px for scroll mode, else a percentage of preferredWidth) is kept,
// reused by the thin tableLayout(rows, columns) adapter that matches the
// interfaces.md contract (columnWidths as CSS width strings, instead of
// upstream's {kind, width, minWidth} column descriptors).

import { DETAIL_HEADER_PATTERN, DETAIL_VALUE_PATTERN } from "./detail-keywords.mjs";

const WIDTHS = {
	number: { min: 64, max: 108 },
	date: { min: 96, max: 132 },
	token: { min: 80, max: 148 },
	text: { min: 96, max: 260 },
	detail: { min: 180, max: 420 },
	longText: { min: 176, max: 520 },
	hardToken: { min: 180, max: 560 },
};

const MINIMUM_READABLE_WIDTH_BY_COLUMN_COUNT = new Map([
	[1, 240],
	[2, 360],
	[3, 500],
	[4, 560],
	[5, 640],
	[6, 720],
	[7, 820],
]);

export function tableLayoutAttributes({ columns = [], columnNames: namedColumns = [], cellsByColumn = [] } = {}) {
	const sourceColumns = Array.isArray(namedColumns) && namedColumns.length > 0
		? namedColumns
		: Array.isArray(columns)
			? columns
			: [];
	const columnNames = sourceColumns.length > 0
		? sourceColumns
		: Array.from({ length: cellsByColumn.length }, (_, index) => `Column ${index + 1}`);
	const measuredColumns = columnNames.map((column, index) =>
		columnLayout(column, cellsByColumn[index] ?? []),
	);
	const measuredWidth = clamp(
		measuredColumns.reduce((sum, column) => sum + column.width, 0),
		160,
		2400,
	);
	const minWidth = measuredColumns.reduce((sum, column) => sum + column.minWidth, 0);
	const hasHardToken = measuredColumns.some((column) => column.kind === "hardToken");
	const shouldScroll = measuredColumns.length >= 8 ||
		minWidth > 920 ||
		(hasHardToken && measuredWidth > 760);
	const preferredWidth = shouldScroll
		? measuredWidth
		: readableTableWidth(measuredWidth, measuredColumns);
	const mode = shouldScroll
		? "scroll"
		: preferredWidth <= 620 && measuredColumns.length <= 3
			? "fit"
			: "wrap";
	const columnLayouts = expandColumnsToWidth(measuredColumns, preferredWidth);

	return {
		mode,
		preferredWidth,
		minWidth,
		columns: columnLayouts,
	};
}

function columnLayout(header, rawValues) {
	const normalizedHeader = String(header ?? "").trim();
	const normalizedValues = rawValues.map((value) => String(value ?? "").trim()).filter(Boolean);
	const dataValues = normalizedValues[0] === normalizedHeader
		? normalizedValues.slice(1)
		: normalizedValues;
	const values = [normalizedHeader, ...dataValues].filter(Boolean);
	const lengths = values.map(visualLength);
	const maxLength = Math.max(...lengths, 0);
	const averageLength = average(lengths);
	const p80Length = percentile(lengths, 0.8);
	const maxTokenLength = Math.max(...values.flatMap(tokenLengths), 0);
	const kind = columnKind(values, { header: normalizedHeader, maxLength, averageLength, maxTokenLength });
	const width = widthForKind(kind, { header, maxLength, averageLength, p80Length, maxTokenLength });
	const bounds = WIDTHS[kind] ?? WIDTHS.text;

	return {
		kind,
		width,
		minWidth: bounds.min,
	};
}

function columnKind(values, metrics) {
	const dataValues = values.slice(1).filter(Boolean);
	if (dataValues.length > 0 && dataValues.every(isNumberLike)) {
		return "number";
	}
	if (dataValues.length > 0 && dataValues.every(isDateLike)) {
		return "date";
	}
	if (isDetailColumn(metrics.header, dataValues)) {
		return "detail";
	}
	if (metrics.maxTokenLength >= 42) {
		return "hardToken";
	}
	if (metrics.maxLength >= 48 || metrics.averageLength >= 26) {
		return "longText";
	}
	if (metrics.maxLength <= 16 && uniqueRatio(dataValues) <= 0.75) {
		return "token";
	}
	return "text";
}

function widthForKind(kind, metrics) {
	const bounds = WIDTHS[kind] ?? WIDTHS.text;
	if (kind === "number" || kind === "date") {
		return bounds.max;
	}
	if (kind === "token") {
		return clamp(Math.round(Math.max(10, metrics.p80Length, visualLength(metrics.header)) * 8 + 28), bounds.min, bounds.max);
	}
	if (kind === "detail") {
		return clamp(Math.round(Math.max(14, metrics.maxLength, metrics.p80Length * 1.15, visualLength(metrics.header)) * 14 + 72), bounds.min, bounds.max);
	}
	if (kind === "hardToken") {
		return clamp(Math.round(Math.min(metrics.maxTokenLength, 64) * 7 + 36), bounds.min, bounds.max);
	}
	if (kind === "longText") {
		const targetLines = metrics.maxLength > 140 ? 3 : 2.5;
		const targetChars = Math.max(22, Math.ceil(metrics.maxLength / targetLines), Math.ceil(metrics.averageLength * 1.25));
		return clamp(Math.round(targetChars * 8 + 34), bounds.min, bounds.max);
	}
	return clamp(Math.round(Math.max(metrics.p80Length, metrics.maxLength * 0.82, visualLength(metrics.header), metrics.averageLength * 1.2, 8) * 8 + 30), bounds.min, bounds.max);
}

function readableTableWidth(measuredWidth, columns) {
	const columnCount = columns.length;
	const breathingRoom = clamp(
		Math.round(measuredWidth * 0.12 + columnCount * 14),
		64,
		72,
	);
	return clamp(
		Math.max(measuredWidth + breathingRoom, minimumReadableWidthForColumnCount(columnCount)),
		160,
		2400,
	);
}

function minimumReadableWidthForColumnCount(columnCount) {
	return MINIMUM_READABLE_WIDTH_BY_COLUMN_COUNT.get(columnCount) ?? 0;
}

function expandColumnsToWidth(columns, targetWidth) {
	const currentWidth = columns.reduce((sum, column) => sum + column.width, 0);
	const extraWidth = Math.round(targetWidth - currentWidth);
	if (extraWidth <= 0 || columns.length === 0) {
		return columns;
	}

	const weights = columns.map((column) => expansionWeight(column.kind));
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	let assignedWidth = 0;

	return columns.map((column, index) => {
		const extra = index === columns.length - 1
			? extraWidth - assignedWidth
			: Math.floor((extraWidth * weights[index]) / totalWeight);
		assignedWidth += extra;
		return { ...column, width: column.width + extra };
	});
}

function expansionWeight(kind) {
	if (kind === "number" || kind === "date") {
		return 0.25;
	}
	if (kind === "token") {
		return 0.35;
	}
	if (kind === "detail") {
		return 3;
	}
	if (kind === "longText") {
		return 2;
	}
	if (kind === "hardToken") {
		return 1.5;
	}
	if (kind === "text") {
		return 1.25;
	}
	return 1;
}

function isDetailColumn(header, values) {
	if (DETAIL_HEADER_PATTERN.test(header)) {
		return true;
	}
	return values.some((value) => DETAIL_VALUE_PATTERN.test(value));
}

function isNumberLike(value) {
	return /^[+-]?(?:¥|\$)?\d[\d,.]*(?:\.\d+)?%?(?:\s*(?:万|元|倍|k|K|M|GB|MB))?$/.test(value);
}

function isDateLike(value) {
	return /^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?$/.test(value) ||
		/^\d{1,2}[-/]\d{1,2}$/.test(value);
}

function uniqueRatio(values) {
	if (values.length === 0) return 1;
	return new Set(values).size / values.length;
}

function tokenLengths(value) {
	return String(value).split(/\s+/).map(visualLength);
}

function visualLength(value) {
	return Array.from(String(value ?? "")).reduce((sum, char) =>
		sum + (char.charCodeAt(0) > 127 ? 1 : 0.58),
	0);
}

function average(values) {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, ratio) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

/**
 * interfaces.md contract:
 * tableLayout(rows, columns) →
 *   {mode: "fit"|"wrap"|"scroll", preferredWidth, minWidth, columnWidths: string[]}
 *
 * rows: Row[] (Record<string, string|number>), columns: string[] of column
 * names in display order. columnWidths uses upstream renderTableColgroup's
 * own formula: pixel widths in scroll mode, percentages of preferredWidth
 * otherwise.
 */
export function tableLayout(rows, columns) {
	const rowList = Array.isArray(rows) ? rows : [];
	const columnNames = Array.isArray(columns) ? columns : [];
	const cellsByColumn = columnNames.map((column) => rowList.map((row) => row?.[column]));
	const layout = tableLayoutAttributes({ columnNames, cellsByColumn });
	const columnWidths = layout.columns.map((column) =>
		layout.mode === "scroll"
			? `${column.width}px`
			: `${Number(((column.width / layout.preferredWidth) * 100).toFixed(4))}%`,
	);

	return {
		mode: layout.mode,
		preferredWidth: layout.preferredWidth,
		minWidth: layout.minWidth,
		columnWidths,
	};
}
