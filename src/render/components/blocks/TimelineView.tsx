import React from "react";
import { extractRows, timelineItem } from "../../../parse/blocks/payload.mjs";

// 只画内容：根节点、标题、按钮组由 BlockFrame 统一产出（attributes 仍然收下，
// 五类 View 的签名保持一致，渲染层才能把它们放进同一张注册表）。
export interface TimelineViewProps {
	attributes: Record<string, string>;
	body: string;
}

// 字段全部 required：timelineItem() 无条件产出这五个字段，required 才能让 tsc
// 在 .mjs 侧改字段名时报 TS2322，而不是让界面上那一栏静默变空。
interface TimelineEntry {
	status: string;
	date: string | number;
	title: string | number;
	body: string | number;
	owner: string | number;
}

export const TimelineView = ({ body }: TimelineViewProps) => {
	const rows: Record<string, string | number>[] = extractRows(body) ?? [];

	if (rows.length === 0) {
		throw new Error("Timeline requires CSV, JSON, or a Markdown table.");
	}

	// Timeline 不过滤字段全空的行——只要 rows 非空即渲染对应数量的 <li>。
	const items: TimelineEntry[] = rows.map((row) => timelineItem(row));

	return (
		<ol className="mosaic-timeline-list">
			{items.map((item, index) => (
				<li
					key={index}
					className={`mosaic-timeline-item is-${item.status ?? "default"}`}
				>
					<div className="mosaic-timeline-marker" aria-hidden="true"></div>
					<div className="mosaic-timeline-content">
						{item.date !== undefined && item.date !== "" && <time>{item.date}</time>}
						{item.title && <strong>{item.title}</strong>}
						{item.body && <p>{item.body}</p>}
						{item.owner && <span className="mosaic-timeline-meta">{item.owner}</span>}
					</div>
				</li>
			))}
		</ol>
	);
};
