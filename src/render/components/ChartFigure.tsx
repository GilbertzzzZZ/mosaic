import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chart, ConfigProps, PlotInstance } from "./Chart";
import { GranularityButtons } from "./GranularityButtons";
import {
	BlockContext,
	BlockErrorBox,
	BlockNotice,
	BlockToolbar,
	IconButton,
	SourceView,
	copyToClipboard,
} from "./blocks/BlockShell";
import { formatBlockReport } from "../block-report.mjs";

export interface BuiltChart {
	chartType: string;
	config: Record<string, unknown>;
	footnote?: string;
	warning?: string;
	granularity: string;
	availableGranularities: string[];
	// unit 不再是 y 轴标题（轴标题横排后仍按文字真实宽度占位，且双轴图只有一个位置
	// 放得下），改由这里的 DOM 呈现：字号、颜色、明暗主题全部跟宿主的 CSS 变量走，
	// 也不再受 canvas 文字测量影响。单轴图只有 unit，双轴图只有 leftUnit/rightUnit。
	unit?: string;
	leftUnit?: string;
	rightUnit?: string;
}

export interface ChartFigureProps {
	title?: string;
	note?: string;
	options: string[]; // granularityOptions ∩ availableGranularities
	initial: BuiltChart;
	build: (granularity: string) => BuiltChart;
	showExportBtn: boolean;
	context: BlockContext;
}

// 双轴图的两个单位并排写成一行 `左 / 右`（用户确认）。读者要自己对应哪个是左轴、
// 哪个是右轴，但双轴图本来就只有两个单位、顺序固定，认知负担很小。
function unitLine(built: BuiltChart): string | undefined {
	const pair = [built.leftUnit, built.rightUnit].filter(Boolean);
	if (pair.length > 0) return pair.join(" / ");
	return built.unit || undefined;
}

export const ChartFigure = ({
	title,
	note,
	options,
	initial,
	build,
	showExportBtn,
	context,
}: ChartFigureProps) => {
	const [granularity, setGranularity] = useState(initial.granularity);
	// 就地重建的三个触发器，均不重渲染 markdown（与阅读视图虚拟化竞态会丢图）：
	// 1) 主题切换事件（main.tsx 广播），用 build 闭包按当前主题重建配置；
	// 2) 宿主宽度变化——打开文件时首渲可能发生在过渡宽度上，标签防碰撞会按
	//    错误几何取舍并被缓存视图固化；安定后按真实宽度重建一次即恢复。
	// 3) 从原文视图切回图表——见下方 toggleSource 的说明。
	const [rebuildEpoch, setRebuildEpoch] = useState(0);
	const [showSource, setShowSource] = useState(false);
	const [sourceHeight, setSourceHeight] = useState<number | undefined>(undefined);
	const figureRef = useRef<HTMLElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const plotRef = useRef<PlotInstance | null>(null);
	useEffect(() => {
		const onThemeChange = () => setRebuildEpoch((e) => e + 1);
		window.addEventListener("mosaic:theme-change", onThemeChange);
		return () =>
			window.removeEventListener("mosaic:theme-change", onThemeChange);
	}, []);
	useEffect(() => {
		const el = figureRef.current;
		if (!el) return;
		// lastWidth 记录"上一次真正据以重建的宽度"，不是"ResizeObserver 上一次看到
		// 的宽度"。阅读视图把段落虚拟化摘离时 ResizeObserver 会先报 0×0、回到布局
		// 时再报回真实宽度；若在摘离那一刻就把 lastWidth 推到新值，回来时宽度与
		// lastWidth 相等，这次 resize 就被自己吃掉了，图表永远停在错误几何上。
		let lastWidth = el.clientWidth;
		let timer: number | undefined;
		const observer = new ResizeObserver(() => {
			const width = el.clientWidth;
			// 高度会随重建波动，只看宽度；0 宽（尚未布局，或宿主已被摘离/隐藏）
			// 不触发，也不推进 lastWidth。
			if (width === 0 || Math.abs(width - lastWidth) < 2) return;
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				// 防抖窗口里宿主可能刚好被摘离。此刻重建会让 G2 量到一个没有布局盒
				// 的容器，退回 640×480 默认画布（见 Chart.tsx 的尺寸不变量注释）。
				// 放弃这一次即可——宿主回到布局里时 ResizeObserver 会再报一次，
				// 那时 lastWidth 还停在旧值，比较仍然成立。
				const settled = el.clientWidth;
				if (settled === 0) return;
				lastWidth = settled;
				setRebuildEpoch((e) => e + 1);
			}, 150);
		});
		observer.observe(el);
		return () => {
			window.clearTimeout(timer);
			observer.disconnect();
		};
	}, []);
	// 每次都重新 build，绝不把 initial 交回渲染器第二次：plots 在渲染时会就地
	// 改写传入的配置（把 label 搬进 labels、删掉 label 键），而它的 transform
	// 不是幂等的——同一个对象再渲染一遍，labels 会被清空且无从恢复，数值标签
	// 就此永久消失。切到别的粒度再切回来正好走这条路。build 是纯计算，重跑
	// 一次的代价远小于这个 bug。
	const { built, error } = useMemo(() => {
		try {
			return { built: build(granularity), error: undefined as string | undefined };
		} catch (e) {
			// 降级路径：新粒度构建失败时保留上一次的图并附错误说明。这里的
			// initial 同样可能已被渲染器消费过，但比整块图消失更可用。
			return { built: initial, error: `Mosaic: ${String((e as Error)?.message ?? e)}` };
		}
	}, [granularity, rebuildEpoch]);

	// 切到原文视图时 <Chart> 被卸载，切回来必须拿一份全新的配置——useMemo 的缓存值
	// 是刚刚交给过 plots 的那一个，再渲染一遍数值标签会永久消失（同上）。所以切回
	// 的那一下推进 rebuildEpoch，让 useMemo 重算。
	const toggleSource = () => {
		if (showSource) {
			setRebuildEpoch((e) => e + 1);
		} else {
			// 框体高宽不变：切换前量一次当前内容高度，锁给原文视图。
			const measured = contentRef.current?.offsetHeight;
			setSourceHeight(measured && measured > 0 ? measured : undefined);
		}
		setShowSource(!showSource);
	};

	const status = error ? "error" : built.warning ? "notice" : "ok";
	const report = (extra: { status?: string; error?: string; notice?: string }) =>
		formatBlockReport({
			context,
			granularity: built.granularity,
			availableGranularities: built.availableGranularities,
			...extra,
		});
	const unit = unitLine(built);

	return (
		<figure className="mosaic-figure" ref={figureRef}>
			<div className="mosaic-figure-header">
				{title && (
					<figcaption className="mosaic-figure-title">{title}</figcaption>
				)}
				{/* 一组控件，不是两组：粒度按钮和三个图标按钮并排在同一个容器里。 */}
				<div className="mosaic-control-group">
					<GranularityButtons
						options={options}
						active={granularity}
						onSelect={setGranularity}
					/>
					<BlockToolbar
						showingSource={showSource}
						onToggleSource={toggleSource}
						onCopy={() =>
							copyToClipboard(
								report({ status, error, notice: built.warning }),
							)
						}
						extra={
							showExportBtn ? (
								<IconButton
									icon="image-down"
									label="Export to PNG"
									onClick={() =>
										plotRef.current?.downloadImage?.(`${built.chartType}.png`)
									}
								/>
							) : null
						}
					/>
				</div>
			</div>
			{error && (
				<BlockErrorBox
					message={error}
					onCopy={() => copyToClipboard(report({ status: "error", error }))}
				/>
			)}
			{/* unit 绝对定位进画布区左上角，和 canvas 里居中的图例同处一行——两者一个是
			    DOM 一个是 canvas，没法排进同一个 flex 行，只能靠定位对齐。 */}
			<div ref={contentRef} className="mosaic-figure-body">
				{unit && !showSource && (
					<span className="mosaic-figure-unit">{unit}</span>
				)}
				{showSource ? (
					<SourceView raw={context.raw} height={sourceHeight} />
				) : (
					<Chart
						type={built.chartType}
						config={built.config as ConfigProps}
						onInstance={(instance) => {
							plotRef.current = instance;
						}}
						// 引擎崩了也要带得走定位上下文：边界只有 message，文件/行号/原文
						// 在这一层。
						renderError={(message) => (
							<BlockErrorBox
								message={message}
								onCopy={() =>
									copyToClipboard(report({ status: "error", error: message }))
								}
							/>
						)}
					/>
				)}
			</div>
			{note && <p className="mosaic-figure-note">{note}</p>}
			{built.warning && (
				<BlockNotice
					text={built.warning}
					onCopy={() =>
						copyToClipboard(report({ status: "notice", notice: built.warning }))
					}
				/>
			)}
			{built.footnote && (
				<p className="mosaic-figure-footnote">{built.footnote}</p>
			)}
		</figure>
	);
};
