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

function withTheme<T extends { config: Record<string, unknown> }>(built: T): T {
	built.config.theme = currentChartTheme();
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
