import React from "react";

// 共享卡片外壳 + 标题 / kicker / 统一错误渲染，供五类内容块视图复用。
// 对应 早期内部实现 的 `mdx-component` / `mdx-component-title` / `mdx-component-kicker`，
// class 前缀按决策记录 4 替换为 `mosaic-`。

export type BlockName =
	"data-table" | "metric-grid" | "timeline" | "decision-box" | "flow-diagram";

export interface BlockShellProps {
	block: BlockName;
	variant?: string;
	className?: string;
	children?: React.ReactNode;
}

export const BlockShell = ({
	block,
	variant,
	className,
	children,
}: BlockShellProps) => {
	const classes = ["mosaic-block", `mosaic-${block}`, variant, className]
		.filter(Boolean)
		.join(" ");
	return (
		<section className={classes} data-mosaic-block={block}>
			{children}
		</section>
	);
};

export const BlockTitle = ({ children }: { children: React.ReactNode }) => (
	<h3 className="mosaic-block-title">{children}</h3>
);

export const BlockKicker = ({ children }: { children: React.ReactNode }) => (
	<span className="mosaic-block-kicker">{children}</span>
);
