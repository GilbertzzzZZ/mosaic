import React from "react";
import { BlockShell, BlockTitle, BlockKicker } from "./BlockShell";
// @ts-ignore -- src/blocks/*.mjs 未类型化（declare module "*.mjs"），契约见 interfaces.md
import {
	extractRows,
	decisionItems,
	normalizeDecisionStatus,
	parseRichBlocks,
	parseInlineText,
} from "../../blocks/payload.mjs";

export interface DecisionBoxViewProps {
	attributes: Record<string, string>;
	body: string;
}

interface DecisionItem {
	label: string;
	value: string;
}

interface RichBlock {
	type: "p" | "ul";
	lines: string[];
}

interface InlineToken {
	type: "text" | "code" | "bold";
	text: string;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
	const tokens: InlineToken[] = (parseInlineText(text) ?? []) as InlineToken[];
	return tokens.map((token, index) => {
		const key = `${keyPrefix}-${index}`;
		if (token.type === "code") return <code key={key}>{token.text}</code>;
		if (token.type === "bold") return <strong key={key}>{token.text}</strong>;
		return <React.Fragment key={key}>{token.text}</React.Fragment>;
	});
}

// DecisionBox 永不报错（渲染报告 §4.7）：label/value 行为空时静默回退到富文本
// （parseRichBlocks 对空 body 返回空数组，渲染出一个空的 .mosaic-decision-body）。
export const DecisionBoxView = ({ attributes, body }: DecisionBoxViewProps) => {
	const statusAttr = attributes.status ?? attributes.decisionStatus;
	const status: string = normalizeDecisionStatus(statusAttr) ?? "";

	const rows: Record<string, string | number>[] = extractRows(body) ?? [];
	const items: DecisionItem[] = decisionItems(rows) ?? [];

	const badges = [statusAttr, attributes.owner, attributes.source].filter(
		(value): value is string => Boolean(value)
	);

	const header = (
		<div className="mosaic-decision-header">
			<BlockKicker>决策</BlockKicker>
			{attributes.title && <BlockTitle>{attributes.title}</BlockTitle>}
			{badges.length > 0 && (
				<div className="mosaic-decision-badges">
					{badges.map((badge, index) => (
						<span key={index} className="mosaic-decision-badge">
							{badge}
						</span>
					))}
				</div>
			)}
		</div>
	);

	if (items.length > 0) {
		return (
			<BlockShell block="decision-box" variant={`is-${status || "default"}`}>
				{header}
				<dl className="mosaic-decision-list">
					{items.map((item, index) => (
						<div key={index}>
							<dt>{item.label}</dt>
							<dd>{renderInline(item.value, `dd-${index}`)}</dd>
						</div>
					))}
				</dl>
			</BlockShell>
		);
	}

	const blocks: RichBlock[] = parseRichBlocks(body) ?? [];

	return (
		<BlockShell block="decision-box" variant={`is-${status || "default"}`}>
			{header}
			<div className="mosaic-decision-body">
				{blocks.map((block, index) =>
					block.type === "ul" ? (
						<ul key={index}>
							{block.lines.map((line, lineIndex) => (
								<li key={lineIndex}>{renderInline(line, `ul-${index}-${lineIndex}`)}</li>
							))}
						</ul>
					) : (
						<p key={index}>{renderInline(block.lines.join(" "), `p-${index}`)}</p>
					)
				)}
			</div>
		</BlockShell>
	);
};
