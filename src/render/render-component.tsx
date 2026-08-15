// src/render/render-component.tsx
// 五类内容块（DataTable/Timeline/DecisionBox/MetricGrid/FlowDiagram）共享分发。
// 与 Chart 不同：这五类是纯 DOM/React，无 AntV/主题/宽度重建基建；渲染失败（含
// dataset 查询失败）就地捕获，落地统一的 mosaic-error DOM，不向调用方抛出。
import React from "react";
import ReactDOM from "react-dom";
import MosaicPlugin from "../main";
import { loadDatasetForNote } from "../parse/obsidian-dataset";
import { queryDataset } from "../parse/dataset-query.mjs";
import { DATASET_GRANULARITIES, isDatasetGranularity } from "../parse/dataset-granularity.mjs";
import { datasetQueryFromContent } from "../parse/blocks/dataset-table.mjs";
import { uniqueStrings } from "../parse/blocks/payload.mjs";
import { whenHostReady } from "./host-ready";
import { DataTableFigure, DataTableQueryResult } from "./components/DataTableFigure";
import { DataTableView } from "./components/blocks/DataTableView";
import { TimelineView } from "./components/blocks/TimelineView";
import { DecisionBoxView } from "./components/blocks/DecisionBoxView";
import { MetricGridView } from "./components/blocks/MetricGridView";
import { FlowDiagramView } from "./components/blocks/FlowDiagramView";

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
	// queryDataset 是无类型 .mjs 纯函数，返回形态由测试保证；在边界断言一次。
	const build = (granularity?: string): DataTableQueryResult =>
		queryDataset({
			manifest,
			rows,
			component: "DataTable",
			attributes,
			query,
			granularity: granularity ?? granularityAttr,
			granularityOptions,
		}) as unknown as DataTableQueryResult;
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
		if (Object.hasOwn(attributes, "dataset")) {
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
