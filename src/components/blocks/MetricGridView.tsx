import React from "react";
import { BlockShell, BlockTitle } from "./BlockShell";
// @ts-ignore -- src/blocks/*.mjs 未类型化（declare module "*.mjs"），契约见 interfaces.md
import { extractRows, metricItem } from "../../blocks/payload.mjs";

export interface MetricGridViewProps {
	attributes: Record<string, string>;
	body: string;
}

interface MetricItem {
	label?: string;
	value?: string | number;
	delta?: string | number;
	note?: string;
	status?: string;
}

export const MetricGridView = ({ attributes, body }: MetricGridViewProps) => {
	const rows: Record<string, string | number>[] = extractRows(body) ?? [];

	if (rows.length === 0) {
		throw new Error("MetricGrid requires CSV, JSON, or a Markdown table.");
	}

	// 无 label 且无 value 的行被过滤；rows 非空但过滤后为空是允许的静默空网格
	// （对齐 早期内部实现 现状，见渲染报告 §2.4）。
	const items: MetricItem[] = rows
		.map((row) => metricItem(row) as MetricItem)
		.filter((item) => item.label || (item.value !== undefined && item.value !== ""));

	return (
		<BlockShell block="metric-grid">
			{attributes.title && <BlockTitle>{attributes.title}</BlockTitle>}
			<div className="mosaic-metric-grid-items">
				{items.map((item, index) => (
					<article
						key={index}
						className={`mosaic-metric-item is-${item.status ?? "neutral"}`}
					>
						{item.label && <span className="mosaic-metric-label">{item.label}</span>}
						{item.value !== undefined && item.value !== "" && (
							<strong>{item.value}</strong>
						)}
						{item.delta !== undefined && item.delta !== "" && (
							<span className="mosaic-metric-delta">{item.delta}</span>
						)}
						{item.note && <p>{item.note}</p>}
					</article>
				))}
			</div>
		</BlockShell>
	);
};
