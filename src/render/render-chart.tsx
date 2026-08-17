// src/render/render-chart.tsx
// 三入口共享的 Chart 渲染层：{attributes, body} → ChartFigure。body 非空走内联
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
import { BuiltChart, ChartFigure } from "./components/ChartFigure";
import { whenHostReady } from "./host-ready";
import { renderInto } from "./react-root";
import { withTheme } from "./chart-theme";

// chart-tag-config 是无类型 .mjs，它的返回值不断言就以 any 的身份流过整条渲染链路。
// 在这一个边界断言一次，之后 built 全程是 BuiltChart——与 render-component 对
// queryDataset 的处理同一口径。BuiltChart 的字段写成 required，.mjs 侧改字段名时
// 消费处会编译期报错。
const buildFromInline = buildChartFromInline as unknown as (source: {
	attributes: Record<string, string>;
	csv: string;
}) => BuiltChart;
const buildFromTag = buildChartFromTag as unknown as (source: {
	manifest: unknown;
	rows: Record<string, string | number>[];
	attributes: Record<string, string>;
	granularity?: string;
}) => BuiltChart;
const granularityOptionsOf = parseGranularityOptions as unknown as (
	attributes: Record<string, string>,
) => string[];

export interface ChartSource {
	attributes: Record<string, string>;
	// 内联数据原文。与 ComponentSource.body 同名同义——两个入口交给渲染层的结构必须
	// 一致，渲染层不该知道内容来自代码块还是标签。
	body: string | null;
	// 解析层收集的未归属片段（`零售业务Label="零售业务"` 这类整条认不出的写法，以及
	// 代码块属性区里写歪的那几行）。曾经挂在属性表上的一个不可枚举 symbol 键上——那要
	// 靠「谁也别复制这张表」的口头约定才成立。现在是并列的显式字段，透传路径与属性表
	// 完全一样。没有片段时省略即可。
	unrecognized?: string[];
}

export async function renderChartInto(
	plugin: MosaicPlugin,
	host: HTMLElement,
	context: BlockContext,
	{ attributes, body, unrecognized }: ChartSource,
	stale: () => boolean = () => false,
): Promise<void> {
	if (body != null && "dataset" in attributes) {
		throw new Error("Provide either dataset= or an inline CSV body, not both.");
	}
	if (!(await whenHostReady(host, stale))) return;
	if (body != null) {
		const build = () => {
			// chart-tag-config 的入参仍叫 csv：Chart 的内联 body 本来就是 CSV，那一层
			// 只服务 Chart，不共用给另外五类。
			const built = withTheme(buildFromInline({ attributes, csv: body }));
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
			buildFromTag({ manifest, rows, attributes, granularity }),
		);
		applyFieldNotice(built, attributes, unrecognized);
		return built;
	};
	const initial = build(undefined);
	const options = granularityOptionsOf(attributes).filter((g) =>
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
