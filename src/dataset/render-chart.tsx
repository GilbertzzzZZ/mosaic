// src/dataset/render-chart.tsx
// 三入口共享的渲染层：{attributes, csv} → ChartFigure。csv 非空走内联模式，
// 否则走 dataset 模式。抛错由各入口调用方就地渲染错误框。
import React from "react";
import ReactDOM from "react-dom";
import { getTheme } from "@antv/g2";
import MosaicPlugin from "../main";
import { loadDatasetForNote } from "./obsidian-dataset";
import {
	buildChartFromTag,
	buildChartFromInline,
	parseGranularityOptions,
} from "./chart-tag-config.mjs";
import { ChartFigure } from "../components/ChartFigure";

// 跟随 Obsidian 主题选择 G2 主题；背景透明，与页面底色融合。
// 主题切换由 mosaic:theme-change 事件驱动 ChartFigure 内重建，本函数被重新求值。
function currentChartTheme(): Record<string, unknown> {
	const dark = document.body.classList.contains("theme-dark");
	const theme = { ...getTheme(dark ? "dark" : "default") };
	theme.background = "transparent";
	return theme;
}

// 数值标签常压在彩色柱体上，纯色文字对比不足（dark 主题尤甚）。按主题给
// 标签加「亮字 + 背景色描边」的 halo：描边制造一圈近背景色光晕，数字压在
// 任何颜色上都可读。
function labelHaloStyle(dark: boolean): Record<string, unknown> {
	return dark
		? { fill: "#E6E6E6", stroke: "#1F1F1F", lineWidth: 2 }
		: { fill: "#595959", stroke: "#FFFFFF", lineWidth: 2 };
}

function withLabelHalo(config: Record<string, any>, dark: boolean): void {
	const style = labelHaloStyle(dark);
	if (config.label) {
		config.label = { ...config.label, style: { ...config.label.style, ...style } };
	}
	if (Array.isArray(config.geometryOptions)) {
		for (const geometry of config.geometryOptions) {
			if (geometry?.label) {
				geometry.label = {
					...geometry.label,
					style: { ...geometry.label.style, ...style },
				};
			}
		}
	}
}

function withTheme<T extends { config: Record<string, unknown> }>(built: T): T {
	const dark = document.body.classList.contains("theme-dark");
	built.config.theme = currentChartTheme();
	withLabelHalo(built.config as Record<string, any>, dark);
	return built;
}

export interface ChartSource {
	attributes: Record<string, string>;
	csv: string | null;
}

export async function renderChartInto(
	plugin: MosaicPlugin,
	host: HTMLElement,
	sourcePath: string,
	{ attributes, csv }: ChartSource,
	stale: () => boolean = () => false,
): Promise<void> {
	if (csv != null && attributes.dataset) {
		throw new Error("Provide either dataset= or an inline CSV body, not both.");
	}
	if (csv != null) {
		const build = () => withTheme(buildChartFromInline({ attributes, csv }));
		const initial = build();
		if (stale()) return;
		ReactDOM.render(
			<ChartFigure
				title={attributes.title}
				note={attributes.note}
				options={[]}
				initial={initial}
				build={build}
				showExportBtn={plugin.settings.showExportBtn}
			/>,
			host,
		);
		return;
	}
	if (!attributes.dataset) {
		throw new Error("Chart needs dataset= or an inline CSV body.");
	}
	const { manifest, rows } = await loadDatasetForNote(
		plugin.app,
		sourcePath,
		attributes.dataset,
	);
	if (stale()) return;
	const build = (granularity?: string) =>
		withTheme(buildChartFromTag({ manifest, rows, attributes, granularity }));
	const initial = build(undefined);
	const options = parseGranularityOptions(attributes).filter((g) =>
		initial.availableGranularities.includes(g),
	);
	ReactDOM.render(
		<ChartFigure
			title={attributes.title}
			note={attributes.note}
			options={options}
			initial={initial}
			build={build}
			showExportBtn={plugin.settings.showExportBtn}
		/>,
		host,
	);
}
