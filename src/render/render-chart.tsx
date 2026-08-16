// src/render/render-chart.tsx
// 三入口共享的 Chart 渲染层：{attributes, csv} → ChartFigure。csv 非空走内联
// 模式，否则走 dataset 模式。抛错由各入口调用方就地渲染错误框。
import React from "react";
import MosaicPlugin from "../main";
import { loadDatasetForNote } from "../parse/obsidian-dataset";
import { applyFieldNotice } from "../parse/chart-tag.mjs";
import {
	buildChartFromTag,
	buildChartFromInline,
	parseGranularityOptions,
} from "./chart-tag-config.mjs";
import { BlockContext } from "./components/blocks/BlockShell";
import { ChartFigure } from "./components/ChartFigure";
import { whenHostReady } from "./host-ready";
import { renderInto } from "./react-root";
import { withTheme } from "./chart-theme";

export interface ChartSource {
	attributes: Record<string, string>;
	csv: string | null;
	// 解析层收集的未归属片段（`零售业务Label="零售业务"` 这类整条认不出的写法）。
	// 曾经挂在 attributes 上的一个不可枚举 symbol 键上——那要靠「谁也别复制这张表」
	// 的口头约定才成立。现在是并列的显式字段，透传路径与 attributes 完全一样。
	// 代码块入口没有这一类片段（frontmatter 写错直接抛错），省略即可。
	unrecognized?: string[];
}

export async function renderChartInto(
	plugin: MosaicPlugin,
	host: HTMLElement,
	context: BlockContext,
	{ attributes, csv, unrecognized }: ChartSource,
	stale: () => boolean = () => false,
): Promise<void> {
	if (csv != null && "dataset" in attributes) {
		throw new Error("Provide either dataset= or an inline CSV body, not both.");
	}
	if (!(await whenHostReady(host, stale))) return;
	if (csv != null) {
		const build = () => {
			const built = withTheme(buildChartFromInline({ attributes, csv }));
			applyFieldNotice(built, attributes, unrecognized);
			return built;
		};
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
				context={context}
			/>,
		);
		return;
	}
	if (!("dataset" in attributes)) {
		throw new Error("Chart needs dataset= or an inline CSV body.");
	}
	const { manifest, rows } = await loadDatasetForNote(
		plugin.app,
		context.sourcePath,
		attributes.dataset,
	);
	if (stale()) return;
	// 数据集加载结果进复制上下文：只给路径、是否加载成功、行数——agent 有文件系统
	// 权限，需要时自己去读，没必要把几千行搬进剪贴板。
	const loadedContext: BlockContext = {
		...context,
		dataset: attributes.dataset,
		datasetStatus: `loaded, ${rows.length} rows`,
	};
	// 没认出来的字段照旧走 built.warning 那条局部提示通道，所以每次重建（切粒度、
	// 换主题、宽度安定）都要重挂一次——build 是纯计算，每次返回一个新的 built。
	const build = (granularity?: string) => {
		const built = withTheme(
			buildChartFromTag({ manifest, rows, attributes, granularity }),
		);
		applyFieldNotice(built, attributes, unrecognized);
		return built;
	};
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
			context={loadedContext}
		/>,
	);
}
