// src/render/block-report.mjs
// 「一份贯穿全程的 BlockContext」的纯计算那一半：定位上下文的文本化（复制按钮的
// 剪贴板内容）与非 Chart 五类的字段提示。
// 单独成模块而不是塞进组件文件，是因为这两件事都是纯字符串计算，可以被 node --test
// 直接跑到——组件那一半要先过一遍打包器才能进测试进程。

/**
 * 区块的定位上下文。两个入口各自在**同步阶段**构造一份（getSectionInfo 必须在
 * processor 同步阶段取好：文档被编辑后 section 会被回收替换，之后再调返回 null），
 * 一路透传到渲染层、提示条与错误框。构造后不改写；需要补字段（如数据集加载结果）
 * 时派生一个新对象。
 *
 * @typedef {object} BlockContext
 * @property {string} sourcePath   笔记在 vault 里的路径
 * @property {number} lineStart    0-based，输出时转 1-based
 * @property {number} lineEnd      0-based，闭区间
 * @property {"self-closing tag" | "paired tag" | "code block"} syntax
 * @property {string} raw          逐字原文（含开标签 / 围栏 / 闭标签）
 * @property {boolean} rawIsReconstructed  原文是拼回来的（拿不到 section info 的
 *   代码块入口）而不是切片得来的
 * @property {string} pluginVersion
 * @property {string} appVersion
 * @property {string} [dataset]        dataset= 的原始写法
 * @property {string} [datasetStatus]  "loaded, 36 rows" / "failed to load"
 */

// 复制内容的行数上限。超过就截断：保留表头 + 前 10 行 + 后 5 行，中段标注省略了多少行。
// 目的是让粘给 agent 的内容仍然能一步定位——表头（开标签那行/围栏那行）给出属性，
// 前后各留一段给出数据的形状与末尾，中间那几百行内联数据对定位没有贡献。
const MAX_SOURCE_LINES = 20;
const HEAD_LINES = 10; // 表头之后再留 10 行
const TAIL_LINES = 5;

/**
 * @param {string} raw
 * @returns {string}
 */
export function truncateSource(raw) {
	const lines = String(raw ?? "").split("\n");
	if (lines.length <= MAX_SOURCE_LINES) return String(raw ?? "");
	const kept = 1 + HEAD_LINES + TAIL_LINES;
	const omitted = lines.length - kept;
	return [
		...lines.slice(0, 1 + HEAD_LINES),
		`… ${omitted} lines omitted …`,
		...lines.slice(lines.length - TAIL_LINES),
	].join("\n");
}

// 行号 0-based 转 1-based 输出，对齐编辑器习惯。行号未知（非预览渲染上下文里
// getSectionInfo 是空桩，恒返回 null）时不写一个假的行范围，只留文件名。
function lineRange(context) {
	if (!(Number(context.lineStart) >= 0)) return "";
	const from = Number(context.lineStart) + 1;
	const to = Number(context.lineEnd) + 1;
	return from === to ? `L${from}` : `L${from}–L${to}`;
}

/**
 * 复制按钮的剪贴板内容。三种形态（整体报错 / 局部提示 / 正常渲染）共用这一份格式，
 * 差别只在 status 与有没有 Error / Notice 段。
 *
 * 刻意不做的两件事：
 *   - 不单列属性表：原文本身就带着全部属性，重复输出纯属体积浪费。
 *   - 不带整个数据集：只给路径、是否加载成功、行数。agent 有文件系统权限，需要时
 *     自己去读，没必要把几千行搬进剪贴板。
 * 粒度状态则必须带：粒度切换是有状态的，很多错误只在切到某一档时出现。
 *
 * @param {{
 *   context: BlockContext,
 *   status?: string,
 *   error?: string,
 *   notice?: string,
 *   granularity?: string,
 *   availableGranularities?: string[],
 * }} input
 * @returns {string}
 */
export function formatBlockReport({
	context,
	status,
	error,
	notice,
	granularity,
	availableGranularities,
}) {
	const resolvedStatus = status ?? (error ? "error" : notice ? "notice" : "ok");
	const syntax = context.rawIsReconstructed
		? `${context.syntax} (source reconstructed)`
		: context.syntax;
	const range = lineRange(context);
	const lines = [
		"## Mosaic block report",
		"",
		`- file: \`${context.sourcePath}\`${range ? ` ${range}` : ""}`,
		`- syntax: ${syntax}`,
		`- status: ${resolvedStatus}`,
	];
	if (granularity) {
		const available = availableGranularities?.length
			? ` (available: ${availableGranularities.join(", ")})`
			: "";
		lines.push(`- granularity: ${granularity}${available}`);
	}
	if (context.dataset) {
		const state = context.datasetStatus ? ` — ${context.datasetStatus}` : "";
		lines.push(`- dataset: \`${context.dataset}\`${state}`);
	}
	lines.push(`- mosaic ${context.pluginVersion} / obsidian ${context.appVersion}`);
	if (error) {
		lines.push("", "### Error", error);
	}
	if (notice) {
		lines.push("", "### Notice", notice);
	}
	// 原文不加围栏：它自己就可能带着 ``` （成对标签的 csv payload、chartview 代码块），
	// 再包一层只会让粘出去的文本在半路断开。报告是剪贴板里的顶层文本，没有外层结构
	// 需要保护。
	lines.push("", "### Source", truncateSource(context.raw));
	return lines.join("\n");
}

// 非 Chart 五类各自认得的属性名。**清单取自代码里的属性消费点，不是文档**——每一项
// 都能在下面这些文件里找到一处 `attributes.X` / `overrides.X`：
//   DataTable   src/render/components/blocks/DataTableView.tsx
//               src/parse/dataset-query.mjs（dataset 模式与 Chart 共用同一份查询属性）
//               src/render/render-component.tsx（dataset / granularity / granularityOptions）
//   Timeline / MetricGrid / FlowDiagram / DecisionBox  各自的 View
// tests/block-report.test.mjs 有一条漂移守卫：把这些文件里的消费点现场抓出来比对
// 本表。新增属性忘了加进来，那条测试会红——否则每个用了新属性的区块都会挂一条假提示。
const DATA_TABLE_ATTRIBUTES = [
	"title",
	"columns",
	// dataset 模式（render-component.tsx + dataset-query.mjs）
	"dataset",
	"granularity",
	"granularityOptions",
	"from",
	"to",
	"x",
	"series",
	"y",
	"bars",
	"bar",
	"lines",
	"line",
	"leftSeries",
	"left",
	"leftAxis",
	"leftY",
	"rightSeries",
	"right",
	"rightAxis",
	"rightY",
];

/** @type {Record<string, Set<string>>} */
export const COMPONENT_ATTRIBUTES = {
	DataTable: new Set(DATA_TABLE_ATTRIBUTES),
	Timeline: new Set(["title"]),
	DecisionBox: new Set(["title", "status", "decisionStatus", "owner", "source"]),
	MetricGrid: new Set(["title"]),
	FlowDiagram: new Set(["title", "note"]),
};

/**
 * 非 Chart 五类的字段提示。与 Chart 的 applyFieldNotice（src/parse/chart-tag.mjs）
 * 同源同措辞，但白名单按区块各自的属性集分——五类各有各的属性，套用 Chart 那份会把
 * DecisionBox 的 owner= 报成未知，也会放过 DataTable 上写错的 titel=。
 *
 * @param {string} name 组件名（COMPONENT_ATTRIBUTES 的键）
 * @param {Record<string, string>} attributes
 * @param {string[]} [unrecognized]
 * @returns {string | undefined}
 */
export function componentFieldNotice(name, attributes, unrecognized) {
	const known = COMPONENT_ATTRIBUTES[name];
	if (!known) return undefined;
	const parts = [];
	if (unrecognized?.length) {
		// 与 applyFieldNotice 逐字一致，理由见那一处：原因因入口而异，写死一边会
		// 把另一边的用户引向错的修法。
		parts.push(`Unrecognized text: ${unrecognized.join(", ")} — ignored (not a recognized attribute).`);
	}
	const unknown = Object.keys(attributes ?? {}).filter((key) => !known.has(key));
	if (unknown.length > 0) {
		parts.push(`Unknown ${name} attributes: ${unknown.join(", ")} — ignored.`);
	}
	return parts.length > 0 ? parts.join("; ") : undefined;
}
