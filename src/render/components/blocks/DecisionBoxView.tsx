import React from "react";
import { BlockChrome } from "./BlockShell";
import {
	extractRows,
	decisionItems,
	normalizeDecisionStatus,
	parseRichBlocks,
	parseInlineText,
} from "../../../parse/blocks/payload.mjs";

// 只画内容：根节点、标题、kicker、徽章、按钮组由 BlockFrame 统一产出
// （头部零件见下方 decisionBoxChrome）。
export interface DecisionBoxViewProps {
	attributes: Record<string, string>;
	body: string;
}

// label/value 用 string | number：decisionItems() 直接透传单元格，而 parseCell()
// 会把纯数字单元格转成 number，所以 string 是不实的收窄。
interface DecisionItem {
	label: string | number;
	value: string | number;
}

interface RichBlock {
	type: "p" | "ul";
	lines: string[];
}

// type 写成 string 而非 "text"|"code"|"bold"：字面量联合只能靠断言或 .mjs 侧
// @returns 声明取得，两者都会截断类型流，反而让改名不再报错。
interface InlineToken {
	type: string;
	text: string;
}

function renderInline(text: string | number, keyPrefix: string): React.ReactNode[] {
	const tokens: InlineToken[] = parseInlineText(text) ?? [];
	return tokens.map((token, index) => {
		const key = `${keyPrefix}-${index}`;
		if (token.type === "code") return <code key={key}>{token.text}</code>;
		if (token.type === "bold") return <strong key={key}>{token.text}</strong>;
		return <React.Fragment key={key}>{token.text}</React.Fragment>;
	});
}

// 五类里唯一有自己头部零件的区块：kicker、徽章、状态 class。它们仍然是 DecisionBox
// 的知识（状态别名、徽章取哪三个属性都在这儿），只是交给 BlockFrame 去画——头部一处
// 画完，切原文时整个头部原样不动。kicker 排在标题之前，`DECISION` 因此仍在标题上方。
export function decisionBoxChrome(attributes: Record<string, string>): BlockChrome {
	const statusAttr = attributes.status ?? attributes.decisionStatus;
	const status: string = normalizeDecisionStatus(statusAttr) ?? "";
	const badges = [statusAttr, attributes.owner, attributes.source].filter(
		(value): value is string => Boolean(value)
	);
	return {
		variant: `is-${status || "default"}`,
		kicker: "Decision",
		headerExtra:
			badges.length > 0 ? (
				<div className="mosaic-decision-badges">
					{badges.map((badge, index) => (
						<span key={index} className="mosaic-decision-badge">
							{badge}
						</span>
					))}
				</div>
			) : undefined,
	};
}

// DecisionBox 永不报错：label/value 行为空时静默回退到富文本
// （parseRichBlocks 对空 body 返回空数组，渲染出一个空的 .mosaic-decision-body）。
export const DecisionBoxView = ({ body }: DecisionBoxViewProps) => {
	const rows: Record<string, string | number>[] = extractRows(body) ?? [];
	const items: DecisionItem[] = decisionItems(rows) ?? [];

	if (items.length > 0) {
		return (
			<dl className="mosaic-decision-list">
				{items.map((item, index) => (
					<div key={index}>
						<dt>{item.label}</dt>
						<dd>{renderInline(item.value, `dd-${index}`)}</dd>
					</div>
				))}
			</dl>
		);
	}

	const blocks: RichBlock[] = parseRichBlocks(body) ?? [];

	return (
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
	);
};
