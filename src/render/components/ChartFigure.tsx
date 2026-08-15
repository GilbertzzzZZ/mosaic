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
		let lastWidth = el.clientWidth;
		let timer: number | undefined;
		const observer = new ResizeObserver(() => {
			const width = el.clientWidth;
			// 高度会随重建波动，只看宽度；0 宽（尚未布局）不触发。
			if (width === 0 || Math.abs(width - lastWidth) < 2) return;
			lastWidth = width;
			window.clearTimeout(timer);
			timer = window.setTimeout(() => setRebuildEpoch((e) => e + 1), 150);
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
