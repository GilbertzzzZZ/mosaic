import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chart, ConfigProps } from "./Chart";
import { GranularityButtons } from "./GranularityButtons";

export interface BuiltChart {
	chartType: string;
	config: Record<string, unknown>;
	footnote?: string;
	warning?: string;
	granularity: string;
	availableGranularities: string[];
}

export interface ChartFigureProps {
	title?: string;
	note?: string;
	options: string[]; // granularityOptions ∩ availableGranularities
	initial: BuiltChart;
	build: (granularity: string) => BuiltChart;
	showExportBtn: boolean;
}

export const ChartFigure = ({
	title,
	note,
	options,
	initial,
	build,
	showExportBtn,
}: ChartFigureProps) => {
	const [granularity, setGranularity] = useState(initial.granularity);
	// 就地重建的两个触发器，均不重渲染 markdown（与阅读视图虚拟化竞态会丢图）：
	// 1) 主题切换事件（main.tsx 广播），用 build 闭包按当前主题重建配置；
	// 2) 宿主宽度变化——打开文件时首渲可能发生在过渡宽度上，标签防碰撞会按
	//    错误几何取舍并被缓存视图固化；安定后按真实宽度重建一次即恢复。
	const [rebuildEpoch, setRebuildEpoch] = useState(0);
	const figureRef = useRef<HTMLElement | null>(null);
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

	return (
		<figure className="mosaic-figure" ref={figureRef}>
			{(title || options.length > 1) && (
				<div className="mosaic-figure-header">
					{title && (
						<figcaption className="mosaic-figure-title">{title}</figcaption>
					)}
					<GranularityButtons
						options={options}
						active={granularity}
						onSelect={setGranularity}
					/>
				</div>
			)}
			{error && <div className="mosaic-error">{error}</div>}
			<Chart
				type={built.chartType}
				config={built.config as ConfigProps}
				showExportBtn={showExportBtn}
			/>
			{note && <p className="mosaic-figure-note">{note}</p>}
			{built.warning && (
				<p className="mosaic-figure-warning">{built.warning}</p>
			)}
			{built.footnote && (
				<p className="mosaic-figure-footnote">{built.footnote}</p>
			)}
		</figure>
	);
};
