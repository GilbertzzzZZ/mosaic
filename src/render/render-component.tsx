// src/render/render-component.tsx
// 五类内容块（DataTable/Timeline/DecisionBox/MetricGrid/FlowDiagram）共享分发。
// 与 Chart 不同：这五类是纯 DOM/React，无 AntV/主题/宽度重建基建；渲染失败（含
// dataset 查询失败）就地捕获，落地统一的 mosaic-error DOM，不向调用方抛出。
import React from "react";
import MosaicPlugin from "../main";
import { loadDatasetForNote } from "../parse/obsidian-dataset";
import { queryDataset } from "../parse/dataset-query.mjs";
import { DATASET_GRANULARITIES, isDatasetGranularity } from "../parse/dataset-granularity.mjs";
import { uniqueStrings } from "../parse/blocks/payload.mjs";
import { componentFieldNotice, formatBlockReport } from "./block-report.mjs";
import { whenHostReady } from "./host-ready";
import { renderInto, unmountRoot } from "./react-root";
import { DataTableFigure, DataTableQueryResult } from "./components/DataTableFigure";
import {
	BlockChrome,
	BlockContext,
	BlockErrorBox,
	BlockFrame,
	BlockName,
	copyToClipboard,
} from "./components/blocks/BlockShell";
import { DataTableView } from "./components/blocks/DataTableView";
import { TimelineView } from "./components/blocks/TimelineView";
import { DecisionBoxView, decisionBoxChrome } from "./components/blocks/DecisionBoxView";
import { MetricGridView } from "./components/blocks/MetricGridView";
import { FlowDiagramView } from "./components/blocks/FlowDiagramView";

export interface ComponentSource {
	name: string;
	attributes: Record<string, string>;
	body: string | null;
	// 解析层收集的未归属片段，语义与 ChartSource.unrecognized 一致。
	unrecognized?: string[];
}

interface BlockDefinition {
	/** 外壳 class 词根，也是 data-mosaic-block 的值。 */
	block: BlockName;
	/** 只负责内容；标题、kicker、按钮组、根节点都归 BlockFrame。 */
	View: React.ComponentType<{ attributes: Record<string, string>; body: string }>;
	/** 区块自有的头部零件；五类里只有 DecisionBox 有。 */
	chrome?: (attributes: Record<string, string>) => BlockChrome;
}

// 五类非 Chart 的注册表。此前这里是两张按组件名索引的表（视图 + class 词根），
// 合成一张之后「加一类区块要动几处」变成了一处。
const BLOCKS: Record<string, BlockDefinition> = {
	DataTable: { block: "data-table", View: DataTableView },
	Timeline: { block: "timeline", View: TimelineView },
	DecisionBox: { block: "decision-box", View: DecisionBoxView, chrome: decisionBoxChrome },
	MetricGrid: { block: "metric-grid", View: MetricGridView },
	FlowDiagram: { block: "flow-diagram", View: FlowDiagramView },
};

// 错误框的正确性依赖 unmount 的同步语义：unmountRoot 返回时 host 内的树已
// 拆完、hook cleanup 已跑完，随后的 empty() 才不会与卸载竞态，错误框也才是
// host 里唯一的内容。
function renderComponentError(host: HTMLElement, context: BlockContext, e: unknown): void {
	unmountRoot(host);
	host.empty();
	const message = `Mosaic: ${String((e as Error)?.message ?? e)}`;
	renderInto(
		host,
		<BlockErrorBox
			message={message}
			onCopy={() =>
				copyToClipboard(formatBlockReport({ context, status: "error", error: message }))
			}
		/>,
	);
}

// granularityOptions 的渲染层浅校验。
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
	context: BlockContext,
	attributes: Record<string, string>,
	body: string,
	notice: string | undefined,
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
	// dataset 模式与内联 payload 互斥：行数据 100% 来自 manifest，body 必须为空。
	// 与 Chart 的 dataset 模式同一口径（renderChartInto 对同样的情况报「二选一」）。
	if (String(body ?? "").trim()) {
		throw new Error("Provide either dataset= or an inline body, not both.");
	}
	const { manifest, rows } = await loadDatasetForNote(
		plugin.app,
		context.sourcePath,
		attributes.dataset,
	);
	if (stale()) return;
	const loadedContext: BlockContext = {
		...context,
		dataset: attributes.dataset,
		datasetStatus: `loaded, ${rows.length} rows`,
	};
	// queryDataset 是无类型 .mjs 纯函数（参数默认值会让 TS 推出闭合形参类型），
	// 返回形态由测试保证；在边界断言一次。
	const runQuery = queryDataset as unknown as (
		args: Record<string, unknown>,
	) => DataTableQueryResult;
	const build = (granularity?: string): DataTableQueryResult =>
		runQuery({
			manifest,
			rows,
			component: "DataTable",
			attributes,
			granularity: granularity ?? granularityAttr,
			granularityOptions,
		});
	const initial = build(undefined);
	const options = granularityOptions.filter((g) =>
		initial.meta.availableGranularities.includes(g),
	);
	if (stale()) return;
	// dataset 模式下外框由 DataTableFigure 自己渲染：粒度状态在它手里，而粒度按钮要和
	// 三个图标按钮同处头部那一个按钮组。
	renderInto(
		host,
		<DataTableFigure
			attributes={attributes}
			body={body}
			options={options}
			initial={initial}
			build={build}
			context={loadedContext}
			notice={notice}
			onCopyError={(message) =>
				copyToClipboard(
					formatBlockReport({ context: loadedContext, status: "error", error: message }),
				)
			}
		/>,
	);
}

export async function renderComponentInto(
	plugin: MosaicPlugin,
	host: HTMLElement,
	context: BlockContext,
	{ name, attributes, body, unrecognized }: ComponentSource,
	stale: () => boolean = () => false,
): Promise<void> {
	if (!(await whenHostReady(host, stale))) return;
	const bodyText = body ?? "";
	// Task 13 拆掉的那道「认不出的字段就整块作废」的闸门是六类区块共用的，但提示条
	// 此前只有 Chart 有。白名单按各自的属性集分——套用 Chart 那份会把 DecisionBox 的
	// owner= 报成未知，也会放过 DataTable 上写错的 titel=。
	const notice = componentFieldNotice(name, attributes, unrecognized);
	try {
		if ("dataset" in attributes) {
			if (name !== "DataTable") {
				throw new Error("External datasets support Chart and DataTable.");
			}
			await renderDataTableDataset(
				plugin,
				host,
				context,
				attributes,
				bodyText,
				notice,
				stale,
			);
			return;
		}
		const definition = BLOCKS[name];
		if (!definition) {
			throw new Error(`Unsupported component: ${name}.`);
		}
		if (stale()) return;
		const { View } = definition;
		renderInto(
			host,
			<BlockFrame
				block={definition.block}
				context={context}
				title={attributes.title}
				notice={notice}
				{...definition.chrome?.(attributes)}
			>
				<View attributes={attributes} body={bodyText} />
			</BlockFrame>,
		);
	} catch (e) {
		if (stale()) return;
		renderComponentError(host, context, e);
	}
}
