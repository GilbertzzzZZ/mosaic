import React, { useEffect, useMemo, useState } from "react";
import { Chart, ConfigProps } from "./Chart";

export interface BuiltChart {
	chartType: string;
	config: Record<string, unknown>;
	footnote: string;
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
	// 主题切换不重渲染 markdown（会与阅读视图虚拟化竞态），由 main.tsx 广播
	// 事件，这里用 build 闭包按当前主题就地重建配置。
	const [themeEpoch, setThemeEpoch] = useState(0);
	useEffect(() => {
		const onThemeChange = () => setThemeEpoch((e) => e + 1);
		window.addEventListener("mosaic:theme-change", onThemeChange);
		return () =>
			window.removeEventListener("mosaic:theme-change", onThemeChange);
	}, []);
	const { built, error } = useMemo(() => {
		if (themeEpoch === 0 && granularity === initial.granularity)
			return { built: initial, error: undefined as string | undefined };
		try {
			return { built: build(granularity), error: undefined as string | undefined };
		} catch (e) {
			return { built: initial, error: String((e as Error)?.message ?? e) };
		}
	}, [granularity, themeEpoch]);

	return (
		<figure className="mosaic-figure">
			{(title || options.length > 1) && (
				<div className="mosaic-figure-header">
					{title && (
						<figcaption className="mosaic-figure-title">{title}</figcaption>
					)}
					{options.length > 1 && (
						<div className="mosaic-granularity-group">
							{options.map((g) => (
								<button
									key={g}
									type="button"
									className={
										"mosaic-granularity-btn" +
										(g === granularity ? " is-active" : "")
									}
									onClick={() => setGranularity(g)}
								>
									{g}
								</button>
							))}
						</div>
					)}
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
			<p className="mosaic-figure-footnote">{built.footnote}</p>
		</figure>
	);
};
