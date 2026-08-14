// src/dataset/render-chart.tsx
// 三入口共享的渲染层：{attributes, csv} → ChartFigure。csv 非空走内联模式，
// 否则走 dataset 模式。抛错由各入口调用方就地渲染错误框。
import React, { useState } from "react";
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
import { queryDataset } from "./dataset-query.mjs";
import { DATASET_GRANULARITIES, isDatasetGranularity } from "./dataset-granularity.mjs";
import { datasetQueryFromContent } from "../blocks/dataset-table.mjs";
import { uniqueStrings } from "../blocks/payload.mjs";
import { DataTableView } from "../components/blocks/DataTableView";
import { TimelineView } from "../components/blocks/TimelineView";
import { DecisionBoxView } from "../components/blocks/DecisionBoxView";
import { MetricGridView } from "../components/blocks/MetricGridView";
import { FlowDiagramView } from "../components/blocks/FlowDiagramView";

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

// Obsidian 打开文件时会在 section 元素尚未挂载（宽度 0，或短暂挂在约
// 330px 的测量容器里）时就调用处理器；此时出图会让 AntV 在错误的画布几何
// 上做标签防碰撞，大量标签被误藏，且被摘离缓存的 section 会把坏画布一直
// 保留。等宿主 attach 且有宽度再渲染；过渡宽度由 ChartFigure 的宽度监听
// 重建兜底。
// 不设超时：虚拟化的 section 可能很久后才挂载，超时会留下永久空段落
// （实测 30s 超时正是空段落来源）。等待只由 stale()（重入/卸载）终止；
// ResizeObserver 观察不到 detached→attached 的时刻，用低频轮询兜底。
const HOST_READY_POLL_MS = 250;

function whenHostReady(
	host: HTMLElement,
	stale: () => boolean,
): Promise<boolean> {
	if (host.isConnected && host.clientWidth > 0) return Promise.resolve(true);
	return new Promise((resolve) => {
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			observer.disconnect();
			window.clearInterval(timer);
			resolve(ok);
		};
		const check = () => {
			if (stale()) return finish(false);
			if (host.isConnected && host.clientWidth > 0) finish(true);
		};
		const observer = new ResizeObserver(check);
		observer.observe(host);
		const timer = window.setInterval(check, HOST_READY_POLL_MS);
	});
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
	if (!(await whenHostReady(host, stale))) return;
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

// ---------------------------------------------------------------------------
// 五类内容块（DataTable/Timeline/DecisionBox/MetricGrid/FlowDiagram）共享分发。
// 与 Chart 不同：这五类是纯 DOM/React，无 AntV/主题/宽度重建基建；渲染失败（含
// dataset 查询失败）就地捕获，落地统一的 mosaic-error DOM，不向调用方抛出。

export interface ComponentSource {
	name: string;
	attributes: Record<string, string>;
	body: string | null;
}

const PLAIN_VIEWS: Record<
	string,
	React.ComponentType<{ attributes: Record<string, string>; body: string }>
> = {
	DataTable: DataTableView,
	Timeline: TimelineView,
	DecisionBox: DecisionBoxView,
	MetricGrid: MetricGridView,
	FlowDiagram: FlowDiagramView,
};

function renderComponentError(host: HTMLElement, e: unknown): void {
	ReactDOM.unmountComponentAtNode(host);
	host.empty();
	host.createDiv({
		cls: "mosaic-error",
		text: `Mosaic: ${String((e as Error)?.message ?? e)}`,
	});
}

// granularityOptions 的渲染层浅校验：措辞与 早期内部实现 逐字一致（解析报告 §2.2）。
// 与 Chart 的 parseGranularityOptions（chart-tag-config.mjs）措辞不同，不能复用。
// 属性缺省（value === undefined）才回退全四档；属性写了但解析后为空（如
// "granularityOptions=\" , \""）视为非法输入，同样报词表错误，不能静默兜底。
// uniqueStrings 去重，避免 "day,day" 这类重复项产出重复的粒度按钮/重复 React key。
function parseDataTableGranularityOptions(value: string | undefined): string[] {
	if (value === undefined) return [...DATASET_GRANULARITIES];
	const raw: string[] = uniqueStrings(
		String(value)
			.split(",")
			.map((s) => s.trim().toLowerCase()),
	);
	if (raw.length === 0) {
		throw new Error("granularityOptions supports day, week, month, and quarter.");
	}
	for (const g of raw) {
		if (!isDatasetGranularity(g)) {
			throw new Error("granularityOptions supports day, week, month, and quarter.");
		}
	}
	return raw;
}

// meta 脚注：格式复用 Chart 的 buildFootnote 风格（chart-tag-config.mjs 私有，未导出，故在此重写）。
function buildDataTableFootnote(meta: Record<string, any>): string {
	return (
		`${meta.datasetTitle} · ${meta.from} → ${meta.to} · ${meta.granularity}` +
		` · ${meta.sourceRows}/${meta.totalRows} source rows · data through ${meta.dataThrough}`
	);
}

interface DataTableQueryResult {
	rows: Record<string, string | number>[];
	attributes: Record<string, any>;
	meta: Record<string, any>;
}

interface DataTableFigureProps {
	attributes: Record<string, string>;
	body: string;
	options: string[];
	initial: DataTableQueryResult;
	build: (granularity: string) => DataTableQueryResult;
}

// 粒度切换是受控组件：DataTableView 自身不管理粒度状态，这里以 build() 闭包
// 重新 queryDataset（数据已在内存，零 IO）后就地重渲染（镜像 ChartFigure 的
// initial+build 模式，但没有主题/宽度重建：DataTable 是纯 DOM，不受那两者影响）。
// 该分支是可达的：例如 columns= 里列了个没有 rollup 的字段，在源粒度下（每桶
// 恰好 1 行）能透传成功，切到更粗的粒度后 aggregateField 会报
// `Field "X" needs a rollup before it can be shown in … view.`——与 ChartFigure
// （src/components/ChartFigure.tsx:40-48/76）同款处理：保留上一次成功渲染的
// 表格，把错误文案就地显示在图内，下一次切换成功时清空。
function DataTableFigure({ attributes, body, options, initial, build }: DataTableFigureProps) {
	const [result, setResult] = useState(initial);
	const [error, setError] = useState<string | undefined>(undefined);
	const onGranularity = (granularity: string) => {
		try {
			const next = build(granularity);
			setResult(next);
			setError(undefined);
		} catch (e) {
			setError(String((e as Error)?.message ?? e));
		}
	};
	return (
		<>
			<DataTableView
				attributes={{ ...attributes, columns: result.attributes.columns }}
				body={body}
				rows={result.rows}
				columnLabels={result.attributes.columnLabels}
				meta={buildDataTableFootnote(result.meta)}
				options={options}
				granularity={result.meta.granularity}
				onGranularity={onGranularity}
			/>
			{error && <div className="mosaic-error">{error}</div>}
		</>
	);
}

async function renderDataTableDataset(
	plugin: MosaicPlugin,
	host: HTMLElement,
	sourcePath: string,
	attributes: Record<string, string>,
	body: string,
	stale: () => boolean,
): Promise<void> {
	const datasetRef = String(attributes.dataset ?? "").trim();
	if (!datasetRef) {
		throw new Error("dataset must point to a .dataset.json manifest.");
	}
	const granularityOptions = parseDataTableGranularityOptions(attributes.granularityOptions);
	const granularityAttr = String(attributes.granularity ?? "auto").trim().toLowerCase();
	if (granularityAttr !== "auto" && !granularityOptions.includes(granularityAttr)) {
		throw new Error("granularity must be included in granularityOptions.");
	}
	const query = datasetQueryFromContent(body);
	const { manifest, rows } = await loadDatasetForNote(plugin.app, sourcePath, attributes.dataset);
	if (stale()) return;
	const build = (granularity?: string): DataTableQueryResult =>
		queryDataset({
			manifest,
			rows,
			component: "DataTable",
			attributes,
			query,
			granularity: granularity ?? granularityAttr,
			granularityOptions,
		});
	const initial = build(undefined);
	const options = granularityOptions.filter((g) =>
		initial.meta.availableGranularities.includes(g),
	);
	if (stale()) return;
	ReactDOM.render(
		<DataTableFigure
			attributes={attributes}
			body={body}
			options={options}
			initial={initial}
			build={build}
		/>,
		host,
	);
}

export async function renderComponentInto(
	plugin: MosaicPlugin,
	host: HTMLElement,
	sourcePath: string,
	{ name, attributes, body }: ComponentSource,
	stale: () => boolean = () => false,
): Promise<void> {
	if (!(await whenHostReady(host, stale))) return;
	const bodyText = body ?? "";
	try {
		if (attributes.dataset) {
			if (name !== "DataTable") {
				throw new Error("External datasets support Chart and DataTable.");
			}
			await renderDataTableDataset(plugin, host, sourcePath, attributes, bodyText, stale);
			return;
		}
		const View = PLAIN_VIEWS[name];
		if (!View) {
			throw new Error(`Unsupported component: ${name}.`);
		}
		if (stale()) return;
		ReactDOM.render(<View attributes={attributes} body={bodyText} />, host);
	} catch (e) {
		if (stale()) return;
		renderComponentError(host, e);
	}
}
