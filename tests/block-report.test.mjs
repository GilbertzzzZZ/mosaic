import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	COMPONENT_ATTRIBUTES,
	componentFieldNotice,
	formatBlockReport,
	truncateSource,
} from "../src/render/block-report.mjs";

// --- Task 15：复制文本的格式 ---

const PAIRED_RAW = [
	'<Chart title="Monthly signups" type="line" x="month" series="revenue">',
	"```csv",
	"month,revenue",
	"2026-01,10",
	"```",
	"</Chart>",
].join("\n");

const context = {
	sourcePath: "cases/01-chart.mdx",
	lineStart: 36, // 0-based；报告里必须是 L37
	lineEnd: 41,
	syntax: "paired tag",
	raw: PAIRED_RAW,
	rawIsReconstructed: false,
	pluginVersion: "1.0.0",
	appVersion: "1.13.7",
	dataset: "_assets/trend.dataset.json",
	datasetStatus: "loaded, 36 rows",
};

test("the report carries every locating field the plan's template lists", () => {
	const text = formatBlockReport({
		context,
		status: "error",
		error: 'Mosaic: Granularity "week" is not in granularityOptions (month,quarter).',
		granularity: "month",
		availableGranularities: ["month", "quarter"],
	});
	const lines = text.split("\n");
	assert.equal(lines[0], "## Mosaic block report");
	assert.equal(lines[1], "");
	assert.equal(lines[2], "- file: `cases/01-chart.mdx` L37–L42");
	assert.equal(lines[3], "- syntax: paired tag");
	assert.equal(lines[4], "- status: error");
	assert.equal(lines[5], "- granularity: month (available: month, quarter)");
	assert.equal(lines[6], "- dataset: `_assets/trend.dataset.json` — loaded, 36 rows");
	assert.equal(lines[7], "- mosaic 1.0.0 / obsidian 1.13.7");
	assert.equal(text.includes("\n### Error\nMosaic: Granularity \"week\""), true);
	// 原文逐字在内：开标签、fence body、闭标签一个不缺
	assert.equal(text.includes("\n### Source\n" + PAIRED_RAW), true);
});

test("line numbers are 0-based inside and 1-based out; a single line collapses", () => {
	const one = formatBlockReport({
		context: { ...context, lineStart: 0, lineEnd: 0, raw: "<Chart />" },
	});
	assert.equal(one.includes("- file: `cases/01-chart.mdx` L1\n"), true);
	assert.equal(one.includes("L1–"), false);
	// 未知行号（非预览渲染上下文里 getSectionInfo 是空桩）不写一个假的行范围
	const unknown = formatBlockReport({
		context: { ...context, lineStart: -1, lineEnd: -1 },
	});
	assert.equal(unknown.includes("- file: `cases/01-chart.mdx`\n"), true);
	assert.equal(/L-?\d/.test(unknown.split("\n")[2]), false);
});

test("a reconstructed source says so, right on the syntax line", () => {
	const text = formatBlockReport({
		context: { ...context, syntax: "code block", rawIsReconstructed: true },
	});
	assert.equal(text.includes("- syntax: code block (source reconstructed)"), true);
});

test("status falls back to what was actually passed in", () => {
	assert.equal(formatBlockReport({ context }).includes("- status: ok"), true);
	assert.equal(
		formatBlockReport({ context, notice: "n" }).includes("- status: notice"),
		true,
	);
	assert.equal(
		formatBlockReport({ context, error: "e" }).includes("- status: error"),
		true,
	);
	// 提示与报错各自成段，同时存在时都在
	const both = formatBlockReport({ context, error: "E!", notice: "N!" });
	assert.equal(both.includes("\n### Error\nE!"), true);
	assert.equal(both.includes("\n### Notice\nN!"), true);
});

test("granularity and dataset lines only appear when there is something to say", () => {
	const bare = formatBlockReport({
		context: { ...context, dataset: undefined, datasetStatus: undefined },
	});
	assert.equal(bare.includes("- dataset:"), false);
	assert.equal(bare.includes("- granularity:"), false);
	// 内联数据的粒度是 "source"、可选档为空：粒度状态照写，括号不写
	const inline = formatBlockReport({
		context: { ...context, dataset: undefined },
		granularity: "source",
		availableGranularities: [],
	});
	assert.equal(inline.includes("- granularity: source\n"), true);
	assert.equal(inline.includes("(available"), false);
});

// --- Task 15：超过 20 行截断 ---

const longRaw = (rows) =>
	[
		'<Chart title="t" type="line" x="month" series="v">',
		"```csv",
		"month,v",
		...Array.from({ length: rows }, (_, i) => `2026-${String(i + 1).padStart(2, "0")},${i}`),
		"```",
		"</Chart>",
	].join("\n");

test("20 lines or fewer come through untouched", () => {
	const raw = longRaw(15); // 15 + 5 = 20 行
	assert.equal(raw.split("\n").length, 20);
	assert.equal(truncateSource(raw), raw);
	assert.equal(truncateSource(raw).includes("omitted"), false);
});

test("past 20 lines it keeps the header, the first 10 and the last 5", () => {
	const raw = longRaw(40); // 45 行
	const original = raw.split("\n");
	const kept = truncateSource(raw).split("\n");
	// 表头 + 前 10 + 省略标记 + 后 5
	assert.equal(kept.length, 17);
	assert.deepEqual(kept.slice(0, 11), original.slice(0, 11));
	assert.deepEqual(kept.slice(12), original.slice(-5));
	// 中段标注省略了多少行，而且数目对得上
	assert.equal(kept[11], "… 29 lines omitted …");
	assert.equal(11 + 29 + 5, original.length);
	// 闭标签仍在——截断不能把定位所需的边界吃掉
	assert.equal(kept[kept.length - 1], "</Chart>");
	// 报告用的是截断后的原文
	assert.equal(
		formatBlockReport({ context: { ...context, raw } }).includes("… 29 lines omitted …"),
		true,
	);
});

// --- Task 13 的口子：非 Chart 五类的提示条 ---

test("each of the five blocks judges unknown attributes by its own whitelist", () => {
	// DecisionBox 认得 owner / source / status，Timeline 不认得
	assert.equal(componentFieldNotice("DecisionBox", { owner: "a", source: "b" }), undefined);
	assert.equal(
		componentFieldNotice("Timeline", { owner: "a" }).includes("Unknown Timeline attributes: owner"),
		true,
	);
	// FlowDiagram 认得 note，MetricGrid 不认得
	assert.equal(componentFieldNotice("FlowDiagram", { note: "n" }), undefined);
	assert.equal(componentFieldNotice("MetricGrid", { note: "n" })?.includes("note"), true);
	// 每一类都认得 title
	for (const name of Object.keys(COMPONENT_ATTRIBUTES)) {
		assert.equal(componentFieldNotice(name, { title: "t" }), undefined, name);
	}
});

test("a misspelled attribute on a non-Chart block is named, the right ones are not", () => {
	const notice = componentFieldNotice("DataTable", {
		title: "t",
		titel: "x",
		columns: "a,b",
	});
	assert.equal(notice.includes("titel"), true);
	assert.equal(notice.includes("columns"), false);
	assert.equal(/\btitle\b/.test(notice), false);
});

test("unrecognized fragments are named in full, alongside unknown names", () => {
	const notice = componentFieldNotice(
		"DataTable",
		{ title: "t", titel: "x" },
		['中文Label="营收"'],
	);
	assert.equal(notice.includes('中文Label="营收"'), true);
	assert.equal(notice.includes("titel"), true);
	assert.equal(notice.split("; ").length, 2);
	// 一条都没有时是 undefined，不是空字符串——调用方据此决定渲不渲染提示条
	assert.equal(componentFieldNotice("DataTable", { title: "t" }, []), undefined);
});

test("an unknown component name yields no notice at all", () => {
	// Chart 走的是 chart-tag.mjs 的 applyFieldNotice，不该在这里被判成"全部未知"
	assert.equal(componentFieldNotice("Chart", { type: "line" }), undefined);
});

// 漂移守卫：五类的白名单必须覆盖各自代码里真正消费的每一个属性名。新增属性忘了加进
// 白名单，用了它的每个区块都会挂一条假提示——这条测试让那件事在 CI 上先红。
// 取的是消费点本身（源码里的 attrs.X / attributes.X / overrides.X），不是文档。
const CONSUMERS = {
	// dataset 模式与 Chart 共用同一份查询属性，所以 dataset-query 整份都算进来；
	// render-component 那三条（dataset / granularity / granularityOptions）同样只有
	// DataTable 支持。
	DataTable: [
		"../src/render/components/blocks/DataTableView.tsx",
		"../src/parse/dataset-query.mjs",
		"../src/render/render-component.tsx",
	],
	Timeline: ["../src/render/components/blocks/TimelineView.tsx"],
	DecisionBox: ["../src/render/components/blocks/DecisionBoxView.tsx"],
	MetricGrid: ["../src/render/components/blocks/MetricGridView.tsx"],
	FlowDiagram: ["../src/render/components/blocks/FlowDiagramView.tsx"],
};

// 五类共用的消费点：标题不再由各 View 自己画，BlockFrame 从 attributes.title 取一次，
// 五类共走这一条。所以 title 从 Timeline / MetricGrid / DecisionBox / DataTable 的
// 自有扫描结果里消失了——那不是漂移，是「头部一处画」的直接后果。下面 SHARED_ATTRS
// 把它补回每一类的消费集合，再由紧随其后的那条测试钉住共用层真的消费了它，免得这个
// 常量与代码脱节。
const SHARED_CONSUMERS = [
	"../src/render/render-component.tsx",
	"../src/render/components/DataTableFigure.tsx",
];
const SHARED_ATTRS = ["title"];

// 每一类**自有**消费点的条数下限：正则哪天抓空了，这条测试不能假绿。
// Timeline 与 MetricGrid 是 0：标题搬走之后，这两个 View 一个属性都不读了（它们仍
// 收下 attributes，只为让五类 View 保持同一个签名）。这两类的守卫由 SHARED_ATTRS
// 那条测试承担。
const MIN_CONSUMERS = {
	DataTable: 12,
	Timeline: 0,
	DecisionBox: 4,
	MetricGrid: 0,
	FlowDiagram: 2,
};

function consumedBy(files) {
	const names = new Set();
	for (const file of files) {
		const source = readFileSync(new URL(file, import.meta.url), "utf8");
		for (const m of source.matchAll(
			/\b(?:attrs|attributes|overrides)\.([A-Za-z_][A-Za-z0-9_]*)/g,
		)) {
			names.add(m[1]);
		}
	}
	return [...names];
}

test("the five whitelists cover every attribute their own code consumes", () => {
	for (const [name, files] of Object.entries(CONSUMERS)) {
		const own = consumedBy(files);
		assert.ok(
			own.length >= MIN_CONSUMERS[name],
			`${name}: only found ${own.length} consumers`,
		);
		const consumed = [...new Set([...own, ...SHARED_ATTRS])];
		const notice = componentFieldNotice(
			name,
			Object.fromEntries(consumed.map((key) => [key, "x"])),
		);
		assert.equal(notice, undefined, `${name} whitelist is missing: ${notice}`);
	}
});

test("title= is consumed once, in the shared frame layer, and nowhere in the views", () => {
	// 正向：共用层真的读了 SHARED_ATTRS 里的每一个名字。这条不成立时，上面那条测试
	// 就是在替一个凭空写死的常量背书。
	const shared = consumedBy(SHARED_CONSUMERS);
	for (const key of SHARED_ATTRS) {
		assert.ok(shared.includes(key), `the shared frame no longer consumes ${key}`);
	}
	// 反向：五个 View 里不再有自己的 title 消费点。这就是「头部一处画」的机器可验
	// 形式——哪个 View 又开始自己画标题，这里先红。
	for (const file of [
		"../src/render/components/blocks/DataTableView.tsx",
		"../src/render/components/blocks/TimelineView.tsx",
		"../src/render/components/blocks/DecisionBoxView.tsx",
		"../src/render/components/blocks/MetricGridView.tsx",
	]) {
		assert.equal(
			consumedBy([file]).includes("title"),
			false,
			`${file} draws its own title again`,
		);
	}
	// FlowDiagramView 是唯一的例外，而且不是画标题：它把 title 喂给 SVG 的
	// aria-label，屏幕阅读器要靠它认出这张图是什么。
	const flow = readFileSync(
		new URL("../src/render/components/blocks/FlowDiagramView.tsx", import.meta.url),
		"utf8",
	);
	assert.equal(flow.includes('aria-label={attributes.title || "Flow diagram"}'), true);
	assert.equal(flow.includes("mosaic-block-title"), false);
});
