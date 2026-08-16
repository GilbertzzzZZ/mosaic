import React from "react";
import { extractRows, metricItem } from "../../../parse/blocks/payload.mjs";

// 只画内容：根节点、标题、按钮组由 BlockFrame 统一产出。
export interface MetricGridViewProps {
	attributes: Record<string, string>;
	body: string;
}

// 字段全部 required：metricItem() 无条件产出这五个字段，required 才能让 tsc
// 在 .mjs 侧改字段名时报 TS2322，而不是让卡片上那一栏静默变空。
interface MetricItem {
	label: string | number;
	value: string | number;
	delta: string | number;
	note: string | number;
	status: string;
}

export const MetricGridView = ({ body }: MetricGridViewProps) => {
	const rows: Record<string, string | number>[] = extractRows(body) ?? [];

	if (rows.length === 0) {
		throw new Error("MetricGrid requires CSV, JSON, or a Markdown table.");
	}

	// 无 label 且无 value 的行被过滤；rows 非空但过滤后为空是允许的静默空网格，
	// 不报错。
	const items: MetricItem[] = rows
		.map((row) => metricItem(row))
		.filter((item) => item.label || item.value !== "");

	return (
		<div className="mosaic-metric-grid-items">
			{items.map((item, index) => (
				<article
					key={index}
					className={`mosaic-metric-item is-${item.status ?? "neutral"}`}
				>
					{item.label && <span className="mosaic-metric-label">{item.label}</span>}
					{item.value !== "" && (
						<strong>{item.value}</strong>
					)}
					{item.delta !== undefined && item.delta !== "" && (
						<span className="mosaic-metric-delta">{item.delta}</span>
					)}
					{item.note && <p>{item.note}</p>}
				</article>
			))}
		</div>
	);
};
