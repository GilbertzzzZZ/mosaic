import React, { useMemo, useState } from "react";
import { extractRows, listAttribute, uniqueStrings } from "../../../parse/blocks/payload.mjs";
import { tableComplexityAttributes } from "../../../parse/blocks/table-complexity.mjs";
import { tableLayout } from "../../../parse/blocks/table-layout.mjs";

export interface DataTableViewProps {
	attributes: Record<string, string>;
	body: string;
	// dataset 模式（由集成层 Task 6 注入）：预取的行、程序生成的表头显示名、脚注文案、
	// 以及粒度切换的受控 props（DataTableView 自身不管理粒度状态，切换由调用方重渲）。
	rows?: Record<string, string | number>[];
	columnLabels?: Record<string, string>;
	meta?: string;
	options?: string[];
	granularity?: string;
	onGranularity?: (granularity: string) => void;
}

interface TableComplexity {
	complexity: "simple" | "complex";
	search: boolean;
	freezeFirstColumn: boolean;
	copyCsv: boolean;
	stickyHeader: boolean;
	toolbar: boolean;
}

interface TableLayout {
	mode: "fit" | "wrap" | "scroll";
	preferredWidth: number;
	minWidth: number;
	columnWidths: string[];
}

function columnsForRows(
	rows: Record<string, string | number>[],
	attributes: Record<string, string>
): string[] {
	if (attributes.columns) return listAttribute(attributes.columns) ?? [];
	const keys: string[] = [];
	rows.forEach((row) => Object.keys(row).forEach((key) => keys.push(key)));
	return uniqueStrings(keys) ?? [];
}

function csvEscape(value: string): string {
	if (/["\n,]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
	return value;
}

function buildCsv(
	columns: string[],
	displayColumn: (col: string) => string,
	rows: Record<string, string | number>[]
): string {
	const lines = [columns.map((col) => csvEscape(displayColumn(col))).join(",")];
	rows.forEach((row) => {
		lines.push(columns.map((col) => csvEscape(String(row[col] ?? ""))).join(","));
	});
	return lines.join("\n");
}

export const DataTableView = ({
	attributes,
	body,
	rows: rowsProp,
	columnLabels,
	meta,
	options = [],
	granularity,
	onGranularity,
}: DataTableViewProps) => {
	const rows: Record<string, string | number>[] = useMemo(
		() => rowsProp ?? extractRows(body) ?? [],
		[rowsProp, body]
	);
	const columns: string[] = useMemo(() => columnsForRows(rows, attributes), [rows, attributes]);

	if (rows.length === 0 || columns.length === 0) {
		throw new Error("DataTable requires CSV, JSON, or a Markdown table.");
	}

	const displayColumn = (col: string) => columnLabels?.[col] ?? col;

	const complexity: TableComplexity = useMemo(
		() => tableComplexityAttributes(rows, columns, attributes),
		[rows, columns, attributes]
	);
	const layout: TableLayout = useMemo(
		() => tableLayout(rows, columns) as TableLayout,
		[rows, columns]
	);

	const [search, setSearch] = useState("");
	const [frozen, setFrozen] = useState(false);

	const needle = search.trim().toLowerCase();
	const rowVisible = rows.map((row) => {
		if (!needle) return true;
		const text = columns.map((col) => String(row[col] ?? "")).join(" ").toLowerCase();
		return text.includes(needle);
	});

	const copyCsv = () => {
		const visibleRows = rows.filter((_, index) => rowVisible[index]);
		const csv = buildCsv(columns, displayColumn, visibleRows);
		navigator.clipboard?.writeText(csv);
	};

	const cardClass = [
		"table-card",
		complexity.complexity === "complex" ? "is-complex-table" : "is-simple-table",
		complexity.stickyHeader ? "is-sticky-header" : "",
		frozen ? "is-first-column-frozen" : "",
	]
		.filter(Boolean)
		.join(" ");

	const cardStyle: React.CSSProperties & Record<string, string> = {
		"--table-preferred-width": `${layout.preferredWidth}px`,
		"--table-min-width": `${layout.minWidth}px`,
	};

	return (
		<div className="mosaic-block mosaic-data-table" data-mosaic-block="data-table">
			{options.length > 1 && (
				<div className="mosaic-granularity-group">
					{options.map((option) => (
						<button
							key={option}
							type="button"
							className={
								"mosaic-granularity-btn" + (option === granularity ? " is-active" : "")
							}
							onClick={() => onGranularity?.(option)}
						>
							{option}
						</button>
					))}
				</div>
			)}
			<div
				className={cardClass}
				data-table-complexity={complexity.complexity}
				data-table-layout={layout.mode}
				style={cardStyle}
			>
				{complexity.toolbar && (
					<div className="table-toolbar">
						{complexity.search && (
							<label className="table-search">
								<input
									type="search"
									aria-label="Filter this table"
									placeholder="Filter…"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
								/>
							</label>
						)}
						{complexity.freezeFirstColumn && (
							<label className="table-toggle">
								<input
									type="checkbox"
									checked={frozen}
									onChange={(event) => setFrozen(event.target.checked)}
								/>
								Freeze first column
							</label>
						)}
						{complexity.copyCsv && (
							<button type="button" onClick={copyCsv}>
								Copy CSV
							</button>
						)}
					</div>
				)}
				<div className="table-scroll" data-table-layout={layout.mode} style={cardStyle}>
					<table>
						<colgroup>
							{columns.map((col, index) => (
								<col key={col} style={{ width: layout.columnWidths[index] }} />
							))}
						</colgroup>
						{attributes.title && <caption>{attributes.title}</caption>}
						<thead>
							<tr>
								{columns.map((col) => (
									<th key={col}>{displayColumn(col)}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, rowIndex) => (
								<tr key={rowIndex} hidden={!rowVisible[rowIndex]}>
									{columns.map((col) => (
										<td key={col}>{row[col] ?? ""}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			{meta && <p className="mosaic-table-meta">{meta}</p>}
		</div>
	);
};
