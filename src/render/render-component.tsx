// src/render/render-component.tsx
// 五类内容块（DataTable/Timeline/DecisionBox/MetricGrid/FlowDiagram）共享分发。
// 与 Chart 不同：这五类是纯 DOM/React，无 AntV/主题/宽度重建基建；渲染失败（含
// dataset 查询失败）就地捕获，落地统一的 mosaic-error DOM，不向调用方抛出。
import React, { useState } from "react";
import MosaicPlugin from "../main";
import { loadDatasetForNote } from "../parse/obsidian-dataset";
import { queryDataset } from "../parse/dataset-query.mjs";
import { DATASET_GRANULARITIES, isDatasetGranularity } from "../parse/dataset-granularity.mjs";
import { datasetQueryFromContent } from "../parse/blocks/dataset-table.mjs";
import { uniqueStrings } from "../parse/blocks/payload.mjs";
import { componentFieldNotice, formatBlockReport } from "./block-report.mjs";
import { whenHostReady } from "./host-ready";
import { renderInto, unmountRoot } from "./react-root";
import { DataTableFigure, DataTableQueryResult } from "./components/DataTableFigure";
import {
	BlockContext,
	BlockErrorBox,
	BlockName,
	BlockNotice,
	BlockShell,
	BlockToolbar,
	BlockToolbarContext,
	SourceView,
	copyToClipboard,
} from "./components/blocks/BlockShell";
import { DataTableView } from "./components/blocks/DataTableView";
import { TimelineView } from "./components/blocks/TimelineView";
import { DecisionBoxView } from "./components/blocks/DecisionBoxView";
import { MetricGridView } from "./components/blocks/MetricGridView";
import { FlowDiagramView } from "./components/blocks/FlowDiagramView";

export interface ComponentSource {
	name: string;
	attributes: Record<string, string>;
	body: string | null;
	// 解析层收集的未归属片段，语义与 ChartSource.unrecognized 一致。
	unrecognized?: string[];
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

// 组件名 → 外壳 class 词根。原文视图借用同一个外壳，切过去时卡片的边框/圆角/内边距
// 与渲染态一致，框体不跳。
const BLOCK_NAMES: Record<string, BlockName> = {
	DataTable: "data-table",
	Timeline: "timeline",
	DecisionBox: "decision-box",
	MetricGrid: "metric-grid",
	FlowDiagram: "flow-diagram",
};

interface BlockFrameProps {
	block: BlockName;
	context: BlockContext;
	notice?: string;
	children?: React.ReactNode;
}

// 五类非 Chart 的外围件：工具栏（切换 / 复制，无导出）、原文视图、提示条。
// 工具栏经 BlockToolbarContext 下发而不是逐层传 prop——五类视图的外壳结构各不相同，
// DataTable 的 dataset 模式中间还隔着 DataTableFigure，用 context 中间那几层一行都
// 不用改（消费点见 BlockShell / DataTableView / FlowDiagramView）。
// 导出按钮不做：那五类是纯 DOM，转 PNG 的两条路（foreignObject 内联全量计算样式 /
// 引第三方库重实现 CSS 布局）对 flex/grid 卡片和 CJK 都不可靠，宿主也没暴露截图 API。
function BlockFrame({ block, context, notice, children }: BlockFrameProps) {
	const [showSource, setShowSource] = useState(false);
	const report = (extra: { status?: string; notice?: string }) =>
		formatBlockReport({ context, ...extra });
	const toolbar = (
		<BlockToolbar
			showingSource={showSource}
			onToggleSource={() => setShowSource(!showSource)}
			onCopy={() =>
				copyToClipboard(report({ status: notice ? "notice" : "ok", notice }))
			}
		/>
	);
	return (
		<BlockToolbarContext.Provider value={toolbar}>
			{showSource ? (
				<BlockShell block={block}>
					<SourceView raw={context.raw} />
				</BlockShell>
			) : (
				children
			)}
			{notice && (
				<BlockNotice
					text={notice}
					onCopy={() => copyToClipboard(report({ status: "notice", notice }))}
				/>
			)}
		</BlockToolbarContext.Provider>
	);
}

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
	const query = datasetQueryFromContent(body);
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
			query,
			granularity: granularity ?? granularityAttr,
			granularityOptions,
		});
	const initial = build(undefined);
	const options = granularityOptions.filter((g) =>
		initial.meta.availableGranularities.includes(g),
	);
	if (stale()) return;
	renderInto(
		host,
		<BlockFrame block="data-table" context={loadedContext} notice={notice}>
			<DataTableFigure
				attributes={attributes}
				body={body}
				options={options}
				initial={initial}
				build={build}
				onCopyError={(message) =>
					copyToClipboard(
						formatBlockReport({ context: loadedContext, status: "error", error: message }),
					)
				}
			/>
		</BlockFrame>,
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
		const View = PLAIN_VIEWS[name];
		if (!View) {
			throw new Error(`Unsupported component: ${name}.`);
		}
		if (stale()) return;
		renderInto(
			host,
			<BlockFrame block={BLOCK_NAMES[name]} context={context} notice={notice}>
				<View attributes={attributes} body={bodyText} />
			</BlockFrame>,
		);
	} catch (e) {
		if (stale()) return;
		renderComponentError(host, context, e);
	}
}
