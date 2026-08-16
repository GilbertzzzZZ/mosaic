import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { setIcon } from "obsidian";

// 共享卡片外壳 + 标题 / kicker / 统一错误渲染，供五类内容块视图复用。
// 外壳、标题、kicker 三层的 class 一律走 `mosaic-` 前缀，与 styles.css 对应。
// 本模块同时是「区块外围件」的共同住处：工具栏插槽、原文视图、错误框、提示条——
// Chart 与其余五类共用同一套，只是挂载位置不同（Chart 挂在 figure header 里，
// 其余五类挂在卡片右上角）。

export type BlockName =
	"data-table" | "metric-grid" | "timeline" | "decision-box" | "flow-diagram";

// 区块的定位上下文，两个入口在同步阶段各构造一份，一路透传到渲染层与错误框。
// 字段语义与 src/render/block-report.mjs 的 BlockContext typedef 一一对应——那边是
// 纯计算侧的文档，这边是类型侧的契约，两者靠 formatBlockReport 的调用点结构化对齐：
// 谁改了字段名，另一边在 tsc 上就对不上。
export interface BlockContext {
	sourcePath: string;
	/** 0-based；输出报告时转 1-based */
	lineStart: number;
	/** 0-based，闭区间 */
	lineEnd: number;
	syntax: "self-closing tag" | "paired tag" | "code block";
	/** 逐字原文（含开标签 / 围栏 / 闭标签） */
	raw: string;
	/** 原文是拼回来的（拿不到 section info 的代码块入口）而不是切片得来的 */
	rawIsReconstructed: boolean;
	pluginVersion: string;
	appVersion: string;
	dataset?: string;
	datasetStatus?: string;
}

// 工具栏走 context 而不是逐层传 prop：五类视图的外壳结构各不相同（三类用
// BlockShell、DataTable 与 FlowDiagram 各有自己的根节点），而 DataTable 的 dataset
// 模式中间还隔着 DataTableFigure。用 context，插槽的提供方只有一处（renderComponentInto
// 的 BlockFrame），消费方各自决定放在哪，中间那几层一行都不用改。
export const BlockToolbarContext = createContext<React.ReactNode>(null);

export const useBlockToolbar = (): React.ReactNode => useContext(BlockToolbarContext);

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
	const toolbar = useBlockToolbar();
	return (
		<section className={classes} data-mosaic-block={block}>
			{toolbar && (
				<div className="mosaic-block-toolbar mosaic-control-group">{toolbar}</div>
			)}
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

// clickable-icon 是 Obsidian 自己的图标按钮类（视图头部那些按钮用的就是它）：尺寸、
// 悬停底色、focus ring、随主题变色全由宿主提供，这里不写一行样式。图标同样用宿主
// 内置的 lucide 库注入，不自带 svg 资源。
export interface IconButtonProps {
	icon: string;
	label: string;
	onClick: () => void;
	// 开关型按钮（如「看原文」）传 active，走宿主原生的 is-active 高亮——按下去
	// 和弹起来必须看得出区别，否则用户不知道自己处在哪个状态。
	active?: boolean;
}

export const IconButton = ({ icon, label, onClick, active }: IconButtonProps) => {
	const ref = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		if (ref.current) setIcon(ref.current, icon);
	}, [icon]);
	return (
		<button
			type="button"
			ref={ref}
			className={active ? "clickable-icon is-active" : "clickable-icon"}
			aria-label={label}
			aria-pressed={active === undefined ? undefined : active}
			data-mosaic-action={label}
			onClick={onClick}
		/>
	);
};

// 一次性动作（复制）没有「开/关」两态，但也必须有反馈：点下去图标换成对勾，
// 1.5 秒后自己变回。不加这个的话点了跟没点一模一样，用户会怀疑没生效。
export const CopyButton = ({ label, onClick }: { label: string; onClick: () => void }) => {
	const [done, setDone] = useState(false);
	useEffect(() => {
		if (!done) return;
		const timer = window.setTimeout(() => setDone(false), 1500);
		return () => window.clearTimeout(timer);
	}, [done]);
	return (
		<IconButton
			icon={done ? "check" : "copy"}
			label={done ? "Copied" : label}
			onClick={() => {
				onClick();
				setDone(true);
			}}
		/>
	);
};

export interface BlockToolbarProps {
	showingSource: boolean;
	onToggleSource: () => void;
	onCopy: () => void;
	// 只有 Chart 有第三个按钮（导出 PNG）：其余五类是纯 DOM，没有画布可导出。
	extra?: React.ReactNode;
}

// 三个（Chart）/ 两个（其余五类）按钮。调用方把它和粒度按钮放进同一个
// .mosaic-control-group，区块右上角因此只有一组按钮而不是两组挨着的小块。
export const BlockToolbar = ({
	showingSource,
	onToggleSource,
	onCopy,
	extra,
}: BlockToolbarProps) => (
	<>
		<IconButton
			icon="code"
			label={showingSource ? "Show rendered block" : "Show source"}
			onClick={onToggleSource}
			active={showingSource}
		/>
		<CopyButton label="Copy block report" onClick={onCopy} />
		{extra}
	</>
);

// 原文视图：框体高宽不变，内容换成标签原文，多了就上下滚动（高度由调用方在切换那一
// 刻量好的渲染高度锁定，量不到时回落到 styles.css 的 max-height）。
export const SourceView = ({ raw, height }: { raw: string; height?: number }) => (
	<pre
		className="mosaic-source-view"
		style={height ? { height: `${height}px` } : undefined}
	>
		<code>{raw}</code>
	</pre>
);

// 整体报错（红框，图出不来）。复制按钮附完整定位上下文，粘给 agent 能一步定位。
export const BlockErrorBox = ({
	message,
	onCopy,
}: {
	message: string;
	onCopy?: () => void;
}) => (
	<div className="mosaic-error">
		<span className="mosaic-error-message">{message}</span>
		{onCopy && (
			<span className="mosaic-control-group">
				<CopyButton label="Copy error report" onClick={onCopy} />
			</span>
		)}
	</div>
);

// 局部提示（橙色左边线，图照常在）。与 ChartFigure 的 .mosaic-figure-warning 同源、
// 同样式——五类非 Chart 此前根本没有这条通道，Task 13 拆掉共用闸门后它们会照常渲染
// 却一声不吭。
export const BlockNotice = ({
	text,
	onCopy,
}: {
	text: string;
	onCopy?: () => void;
}) => (
	<p className="mosaic-figure-warning">
		<span className="mosaic-notice-message">{text}</span>
		{onCopy && (
			<span className="mosaic-control-group">
				<CopyButton label="Copy notice report" onClick={onCopy} />
			</span>
		)}
	</p>
);

/** 剪贴板写入的唯一出口：宿主是 Chromium，navigator.clipboard 恒在，仍按可选调用。 */
export function copyToClipboard(text: string): void {
	navigator.clipboard?.writeText(text);
}
