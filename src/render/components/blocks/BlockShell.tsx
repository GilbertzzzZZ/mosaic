import React, { useEffect, useRef, useState } from "react";
import { setIcon } from "obsidian";
import { formatBlockReport } from "../../block-report.mjs";

// 五类非 Chart 内容块的统一外框（BlockFrame）+ 共用外围件（原文视图、错误框、提示条、
// 图标按钮）。所有 class 一律走 `mosaic-` 前缀，与 styles.css 对应。
// 头部只有这一处画：根节点、标题、kicker、按钮组全部由 BlockFrame 产出，View 组件只
// 负责内容。Chart 不走这里——ChartFigure 早就是这个形状（.mosaic-figure-header 里
// 放 .mosaic-figure-heading + .mosaic-control-group），本模块是它在五类上的对应物。

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

// 区块自有的头部零件。五类里只有 DecisionBox 用得上（kicker + 徽章 + 状态 class），
// 其余四类整份缺省——所以这三样是可选项，而不是每个 View 各画一份的理由。
export interface BlockChrome {
	/** 追加到根节点的状态 class，如 DecisionBox 的 `is-accepted`。 */
	variant?: string;
	/** 标题上方那行小字（DecisionBox 的 `DECISION`）。必须在标题之上，不能倒过来。 */
	kicker?: string;
	/** 标题右侧的区块自有头部内容（DecisionBox 的徽章）。 */
	headerExtra?: React.ReactNode;
}

export interface BlockFrameProps extends BlockChrome {
	block: BlockName;
	context: BlockContext;
	/** 五类共用 `title=` 属性；空缺时头部只剩按钮组。 */
	title?: string;
	/** 排在图标按钮之前、同处一个 .mosaic-control-group 的区块自有控件
	 *  （DataTable 的粒度按钮）。右上角因此只有一组按钮，不是两组挨着的小块。 */
	controls?: React.ReactNode;
	notice?: string;
	children?: React.ReactNode;
}

// 五类非 Chart 的统一外框：根节点 + 头部（标题 / kicker / 按钮组）画一次，切原文时
// 只换内容区。这正是原先那个 bug 的解法——此前切换是把整个区块换成一个只有工具栏的
// 空壳，标题（各 View 自己画的）跟着消失，根节点也从 <div>/<figure> 变成 <section>，
// 边框圆角随之全变。现在根节点与头部在两种状态下是同一棵子树，不可能不一致。
// 导出按钮不做：那五类是纯 DOM，转 PNG 的两条路（foreignObject 内联全量计算样式 /
// 引第三方库重实现 CSS 布局）对 flex/grid 卡片和 CJK 都不可靠，宿主也没暴露截图 API。
export function BlockFrame({
	block,
	context,
	title,
	kicker,
	headerExtra,
	controls,
	variant,
	notice,
	children,
}: BlockFrameProps) {
	const [showSource, setShowSource] = useState(false);
	const report = (extra: { status?: string; notice?: string }) =>
		formatBlockReport({ context, ...extra });
	const classes = ["mosaic-block", `mosaic-${block}`, variant].filter(Boolean).join(" ");
	const heading = kicker || title || headerExtra;
	return (
		<>
			<section className={classes} data-mosaic-block={block}>
				<div className="mosaic-block-header">
					{heading && (
						<div className="mosaic-block-heading">
							{kicker && <span className="mosaic-block-kicker">{kicker}</span>}
							{title && <h3 className="mosaic-block-title">{title}</h3>}
							{headerExtra}
						</div>
					)}
					<div className="mosaic-control-group">
						{controls}
						<BlockToolbar
							showingSource={showSource}
							onToggleSource={() => setShowSource(!showSource)}
							onCopy={() =>
								copyToClipboard(
									report({ status: notice ? "notice" : "ok", notice }),
								)
							}
						/>
					</div>
				</div>
				{showSource ? <SourceView raw={context.raw} /> : children}
			</section>
			{notice && (
				<BlockNotice
					text={notice}
					onCopy={() => copyToClipboard(report({ status: "notice", notice }))}
				/>
			)}
		</>
	);
}
