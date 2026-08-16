import React, { useMemo } from "react";
import { extractRows, listAttribute, uniqueStrings } from "../../../parse/blocks/payload.mjs";
import { tableLayout } from "../../../parse/blocks/table-layout.mjs";

// 只画内容：根节点、标题、按钮组（含 dataset 模式的粒度按钮）由 BlockFrame 统一产出。
// 粒度状态仍归 DataTableFigure，它把按钮作为 controls 交给 BlockFrame，因此粒度按钮
// 和三个图标按钮落在同一个 .mosaic-control-group 里。
export interface DataTableViewProps {
	attributes: Record<string, string>;
	body: string;
	// dataset 模式（由集成层 Task 6 注入）：预取的行、程序生成的表头显示名、脚注文案。
	rows?: Record<string, string | number>[];
	columnLabels?: Record<string, string>;
	meta?: string;
}

// tableLayout() 无条件产出这四个字段，required 才能让 tsc 在 .mjs 侧改字段名时
// 报 TS2322。mode 写成 string 而非 "fit"|"wrap"|"scroll"：字面量联合只能靠断言
// 或 .mjs 侧 @returns 声明取得，两者都会截断类型流，反而让改名不再报错。
interface TableLayout {
	mode: string;
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

export const DataTableView = ({
	attributes,
	body,
	rows: rowsProp,
	columnLabels,
	meta,
}: DataTableViewProps) => {
	const rows: Record<string, string | number>[] = useMemo(
		() => rowsProp ?? extractRows(body) ?? [],
		[rowsProp, body]
	);
	const columns: string[] = useMemo(() => columnsForRows(rows, attributes), [rows, attributes]);

	const layout: TableLayout = useMemo(
		() => tableLayout(rows, columns),
		[rows, columns]
	);

	// throw 必须位于全部 hooks 之后（rules-of-hooks）：上面的纯函数对空输入
	// 均安全返回，这里再拒绝空表。
	if (rows.length === 0 || columns.length === 0) {
		throw new Error("DataTable requires CSV, JSON, or a Markdown table.");
	}

	const displayColumn = (col: string) => columnLabels?.[col] ?? col;

	// 变量挂在卡片上，供 scroll 模式的 table 宽度规则（styles.css）消费。
	const cardStyle: React.CSSProperties & Record<string, string> = {
		"--table-preferred-width": `${layout.preferredWidth}px`,
		"--table-min-width": `${layout.minWidth}px`,
	};

	return (
		<>
			<div
				className="table-card"
				data-table-layout={layout.mode}
				style={cardStyle}
			>
				<div className="table-scroll" data-table-layout={layout.mode}>
					<table>
						<colgroup>
							{columns.map((col, index) => (
								<col key={col} style={{ width: layout.columnWidths[index] }} />
							))}
						</colgroup>
						{/* title= 现在画在 BlockFrame 的头部（与其余四类一致），表内不再
						    重复一份 <caption>——两处同名标题只会让人以为渲染错了。 */}
						<thead>
							<tr>
								{columns.map((col) => (
									<th key={col}>{displayColumn(col)}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, rowIndex) => (
								<tr key={rowIndex}>
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
		</>
	);
};
