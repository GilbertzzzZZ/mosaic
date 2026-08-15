// src/render/render-chart.tsx
// 三入口共享的 Chart 渲染层：{attributes, csv} → ChartFigure。csv 非空走内联
// 模式，否则走 dataset 模式。抛错由各入口调用方就地渲染错误框。
import React from "react";
import MosaicPlugin from "../main";
import { loadDatasetForNote } from "../parse/obsidian-dataset";
import {
	buildChartFromTag,
	buildChartFromInline,
	parseGranularityOptions,
} from "./chart-tag-config.mjs";
import { ChartFigure } from "./components/ChartFigure";
import { whenHostReady } from "./host-ready";
import { renderInto } from "./react-root";
import { withTheme } from "./chart-theme";

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
	if (csv != null && "dataset" in attributes) {
		throw new Error("Provide either dataset= or an inline CSV body, not both.");
	}
	if (!(await whenHostReady(host, stale))) return;
	if (csv != null) {
		const build = () => withTheme(buildChartFromInline({ attributes, csv }));
		const initial = build();
		if (stale()) return;
		renderInto(
			host,
			<ChartFigure
				title={attributes.title}
				note={attributes.note}
				options={[]}
				initial={initial}
				build={build}
				showExportBtn={plugin.settings.showExportBtn}
			/>,
		);
		return;
	}
	if (!("dataset" in attributes)) {
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
	renderInto(
		host,
		<ChartFigure
			title={attributes.title}
			note={attributes.note}
			options={options}
			initial={initial}
			build={build}
			showExportBtn={plugin.settings.showExportBtn}
		/>,
	);
}
