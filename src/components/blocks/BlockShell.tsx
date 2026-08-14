import React from "react";

// 共享卡片外壳 + 标题 / kicker / 统一错误渲染，供五类内容块视图复用。
// 对应 git-leaf 的 `mdx-component` / `mdx-component-title` / `mdx-component-kicker`，
// class 前缀按决策记录 4 替换为 `mosaic-`。

export type BlockName =
	"data-table" | "metric-grid" | "timeline" | "decision-box" | "flow-diagram";

export interface BlockShellProps {
	as?: "section" | "figure" | "div";
	block: BlockName;
	variant?: string;
	className?: string;
	children?: React.ReactNode;
}

export const BlockShell = ({
	as = "section",
	block,
	variant,
	className,
	children,
}: BlockShellProps) => {
	const Tag = as as keyof JSX.IntrinsicElements;
	const classes = ["mosaic-block", `mosaic-${block}`, variant, className]
		.filter(Boolean)
		.join(" ");
	return (
		<Tag className={classes} data-mosaic-block={block}>
			{children}
		</Tag>
	);
};

export const BlockTitle = ({ children }: { children: React.ReactNode }) => (
	<h3 className="mosaic-block-title">{children}</h3>
);

export const BlockKicker = ({ children }: { children: React.ReactNode }) => (
	<span className="mosaic-block-kicker">{children}</span>
);

// 统一错误渲染：cls `mosaic-error`（宿主既有样式）+ `Mosaic: ` 前缀 + git-leaf 原文错误信息。
// 视图本身不调用此函数——views 直接 throw git-leaf 原文 Error，实际的 try/catch 与
// DOM 落地在集成层（Task 6）；这里导出供集成层复用同一份错误 DOM 结构。
export function blockError(name: string, message: string): JSX.Element {
	return (
		<div className="mosaic-error" data-mosaic-block={name}>
			{`Mosaic: ${message}`}
		</div>
	);
}
