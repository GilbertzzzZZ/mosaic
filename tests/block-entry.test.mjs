// tests/block-entry.test.mjs
// 六类内容块的两种物理写法必须完全对等：同一套字段契约，同一份解析产物，渲染层不
// 知道内容来自哪种写法。断言的是**效果**——真的渲染出对应的区块、真的挂上提示条、
// 真的报同一个错，而不是断言某张映射表长什么样。
import test from "node:test";
import assert from "node:assert/strict";
import { parseBlockSource } from "../src/parse/block-source.mjs";
import { findComponentTags } from "../src/parse/chart-tag.mjs";
import { document, flush, installGlobals, query, queryAll, serialize } from "./helpers/dom.mjs";

// 全局必须先装好：打包产物里 preact 一被求值就会去摸 document。
const clipboard = installGlobals();
const { loadComponents } = await import("./helpers/bundle.mjs");
const { BLOCK_LANGUAGES, createBlockProcessor, createChartTagProcessor } =
	await loadComponents();

function fakePlugin(overrides = {}) {
	return {
		isUnloading: false,
		settings: { showExportBtn: false },
		manifest: { version: "1.0.0" },
		registerTeardown: (fn) => fn,
		app: {},
		...overrides,
	};
}

// 宿主交给代码块处理器的 source **永远不含围栏**；section info 里的 text 才是带围栏
// 的整篇原文。两者都按真身的形状造。
async function renderCodeBlock(language, source, options = {}) {
	const el = document.createElement("div");
	document.body.appendChild(el);
	const fenced = "```" + language + "\n" + source + "\n```";
	const text = ["intro", ...fenced.split("\n")].join("\n");
	const ctx = {
		sourcePath: "notes/demo.md",
		addChild: () => {},
		getSectionInfo:
			options.getSectionInfo ??
			(() => ({ text, lineStart: 1, lineEnd: text.split("\n").length - 1 })),
	};
	await createBlockProcessor(fakePlugin(), BLOCK_LANGUAGES[language], language)(
		source,
		el,
		ctx,
	);
	await flush();
	return el;
}

// 图表替身在每次渲染时打一个全局自增序号（data-render-seq）——那是测试装置的计数
// 器，不是产物的一部分。比对两种写法的产物时把它抹掉，否则「第几个渲染的」会伪装成
// 一处真实差异。
const shape = (el) => serialize(el).replace(/ data-render-seq="\d+"/g, "");

async function renderTag(text) {
	const el = document.createElement("div");
	document.body.appendChild(el);
	await createChartTagProcessor(fakePlugin())(el, {
		sourcePath: "notes/demo.md",
		addChild: () => {},
		getSectionInfo: () => ({ text, lineStart: 0, lineEnd: text.split("\n").length - 1 }),
	});
	await flush();
	return el;
}

// 六类各一份最小可渲染样本。内联 body 一律裸写（不套 ```csv 围栏）——代码块里再嵌
// 一层同长度的围栏会把外层围栏提前关掉，这是写法本身的约束，不是解析层的。
const SIX = [
	{
		language: "chart",
		source: "---\ntype: line\nx: month\nseries: v\n---\nmonth,v\n2026-01,1",
		content: "[data-plot]",
		block: null, // Chart 走 ChartFigure，没有 data-mosaic-block
	},
	{
		language: "datatable",
		source: "---\ntitle: t\n---\na,b\n1,2",
		content: "table",
		block: "data-table",
	},
	{
		language: "timeline",
		source: "---\ntitle: t\n---\ndate,title\n2026-01,a",
		content: ".mosaic-timeline-item",
		block: "timeline",
	},
	{
		language: "metricgrid",
		source: "---\ntitle: t\n---\nlabel,value\na,1",
		content: ".mosaic-metric-item",
		block: "metric-grid",
	},
	{
		language: "decisionbox",
		source: "---\ntitle: t\n---\nlabel,value\na,1",
		content: ".mosaic-decision-list",
		block: "decision-box",
	},
	{
		language: "flowdiagram",
		source: '---\ntitle: t\n---\n{"nodes":[{"id":"a","label":"A"}]}',
		content: "svg",
		block: "flow-diagram",
	},
];

// --- Task 3：六个语言名各自渲染出对应的类型 ---

test("each of the six code-block languages renders its own block type", async () => {
	for (const fixture of SIX) {
		const el = await renderCodeBlock(fixture.language, fixture.source);
		assert.equal(query(el, ".mosaic-error"), null, `${fixture.language} fell into an error box`);
		assert.equal(
			queryAll(el, fixture.content).length,
			1,
			`\`\`\`${fixture.language} did not render ${fixture.content}`,
		);
		if (fixture.block) {
			// 类型判别的机器可验形式：分发到别的组件时这里立刻红
			assert.equal(
				query(el, ".mosaic-block").getAttribute("data-mosaic-block"),
				fixture.block,
				fixture.language,
			);
		}
	}
});

test("the six languages are exactly the component names in lower case, plus chartview", () => {
	// 映射表只有一处，且由 COMPONENT_NAMES 派生——凭空多出或漏掉一个语言名，这里红。
	assert.deepEqual(
		Object.keys(BLOCK_LANGUAGES).sort(),
		["chart", "chartview", "datatable", "decisionbox", "flowdiagram", "metricgrid", "timeline"],
	);
	assert.equal(BLOCK_LANGUAGES.chartview, "Chart");
	assert.equal(BLOCK_LANGUAGES.chart, "Chart");
	assert.equal(BLOCK_LANGUAGES.flowdiagram, "FlowDiagram");
});

test("```chartview and ```chart render exactly the same thing", async () => {
	const source = SIX[0].source;
	const legacy = await renderCodeBlock("chartview", source);
	const current = await renderCodeBlock("chart", source);
	assert.equal(queryAll(current, "[data-plot]").length, 1);
	// 别名不是「也能用」，是逐字节相同的产物
	assert.equal(shape(current), shape(legacy));
});

// --- 本轮的核心契约：同一份内容，两种写法的解析产物结构相同 ---

test("the same content parses to the same structure either way it is written", () => {
	const code = parseBlockSource("---\ntitle: Q3\nstatus: accepted\n---\nlabel,value\na,1");
	const [tag] = findComponentTags(
		'<DecisionBox title="Q3" status="accepted">\nlabel,value\na,1\n</DecisionBox>',
	);
	// 三个交给渲染层的字段同名——csv 那个 Chart 印记的名字没了，也没换成别的分裂写法
	assert.deepEqual(Object.keys(code).sort(), ["attributes", "body", "unrecognized"]);
	for (const field of ["attributes", "body", "unrecognized"]) {
		assert.ok(field in tag, `the tag entry lost ${field}`);
	}
	// 三个字段同义
	assert.deepEqual(code.attributes, tag.attributes);
	assert.deepEqual(code.unrecognized, tag.unrecognized);
	// body 只差标签写法自带的那圈换行（代码块的属性区闭合 --- 之后即是 body）
	assert.equal(code.body, tag.body.trim());
});

test("the two spellings of one block render byte-identical DOM", async () => {
	const code = await renderCodeBlock("timeline", "---\ntitle: t\n---\ndate,title\n2026-01,a");
	const tag = await renderTag(
		'<Timeline title="t">\n```csv\ndate,title\n2026-01,a\n```\n</Timeline>',
	);
	// 渲染层对写法无感：同一份数据、同一套属性，出来的就该是同一棵树
	assert.equal(shape(code), shape(tag));
	// 反向哨兵：这条断言不是因为两边都渲染成了空
	assert.equal(queryAll(code, ".mosaic-timeline-item").length, 1);
});

test("a Chart renders the same from a code block as from a tag", async () => {
	const code = await renderCodeBlock(
		"chart",
		"---\ntype: line\nx: month\nseries: v\n---\nmonth,v\n2026-01,1\n2026-02,2",
	);
	const tag = await renderTag(
		'<Chart type="line" x="month" series="v">\n```csv\nmonth,v\n2026-01,1\n2026-02,2\n```\n</Chart>',
	);
	assert.equal(shape(code), shape(tag));
	assert.equal(queryAll(code, "[data-plot]").length, 1);
});

// --- Task 4：容错口径拉齐 ---

test("a misspelled field in a code block still renders, and the notice names it", async () => {
	const el = await renderCodeBlock(
		"chart",
		"---\ntype: line\nx: month\nseries: v\ntitel: oops\n---\nmonth,v\n2026-01,1",
	);
	// 图照常出——这就是与标签入口拉齐的那一半
	assert.equal(queryAll(el, "[data-plot]").length, 1);
	const notice = query(el, "p.mosaic-figure-warning");
	assert.notEqual(notice, null, "no notice at all");
	assert.equal(notice.textContent.includes("titel"), true);
	// 拼对的那些一个都不能被点名
	assert.equal(notice.textContent.includes("series"), false);
});

test("the same misspelling written as a tag behaves identically", async () => {
	const code = await renderCodeBlock(
		"chart",
		"---\ntype: line\nx: month\nseries: v\ntitel: oops\n---\nmonth,v\n2026-01,1",
	);
	const tag = await renderTag(
		'<Chart type="line" x="month" series="v" titel="oops">\n```csv\nmonth,v\n2026-01,1\n```\n</Chart>',
	);
	assert.equal(shape(code), shape(tag));
	assert.equal(query(tag, "p.mosaic-figure-warning").textContent.includes("titel"), true);
});

test("a malformed attribute line no longer fails the whole code block", async () => {
	// 改造前：parseAttributeLines 遇到缩进行 / 值为空即 throw，整块变成一个错误框。
	const el = await renderCodeBlock(
		"chart",
		"---\ntype: line\nx: month\nseries: v\nlabels:\n  position: top\n---\nmonth,v\n2026-01,1",
	);
	assert.equal(query(el, ".mosaic-error"), null, "still an all-or-nothing error box");
	assert.equal(queryAll(el, "[data-plot]").length, 1);
	const notice = query(el, "p.mosaic-figure-warning");
	assert.notEqual(notice, null);
	assert.equal(notice.textContent.includes("labels:"), true);
	assert.equal(notice.textContent.includes("position: top"), true);
});

test("a misspelled field on a non-Chart code block is named under the block", async () => {
	const el = await renderCodeBlock(
		"timeline",
		"---\ntitle: t\ntitel: x\n---\ndate,title\n2026-01,a",
	);
	assert.equal(queryAll(el, ".mosaic-timeline-item").length, 1);
	const notice = query(el, "p.mosaic-figure-warning");
	assert.notEqual(notice, null);
	assert.equal(notice.textContent.includes("Unknown Timeline attributes: titel"), true);
});

test("a code block whose attribute section reads as nothing at all is rejected whole", async () => {
	// 尽力解析的前提是「这确实是一个属性区，只是有几条写歪了」。一条都认不出来时
	// 整块退回，与标签入口的体量判据同一个道理。
	const el = await renderCodeBlock("chart", "---\njust prose, no fields\n---\nmonth,v\n2026-01,1");
	const box = query(el, ".mosaic-error");
	assert.notEqual(box, null);
	assert.equal(box.textContent.includes("just prose, no fields"), true);
	assert.equal(queryAll(el, "[data-plot]").length, 0);
});

// --- ⚠️ Task 4 的例外：结构边界不放宽 ---

test("a code block missing its closing --- errors as a whole", async () => {
	for (const language of ["chart", "timeline"]) {
		const el = await renderCodeBlock(language, "---\ntitle: t\ndate,title\n2026-01,a");
		const box = query(el, ".mosaic-error");
		assert.notEqual(box, null, `${language} rendered something instead of erroring`);
		assert.equal(box.textContent.includes('closing "---"'), true, language);
		// 没有半张图 / 半个区块留在旁边
		assert.equal(queryAll(el, ".mosaic-block").length, 0, language);
		assert.equal(queryAll(el, "[data-plot]").length, 0, language);
	}
});

test("a code block with no opening --- errors as a whole", async () => {
	const el = await renderCodeBlock("timeline", "title: t\ndate,title\n2026-01,a");
	const box = query(el, ".mosaic-error");
	assert.notEqual(box, null);
	assert.equal(box.textContent.includes("must start with"), true);
});

// --- ⚠️ Task 2：拼回的围栏用实际语言名 ---

test("without a section info the rebuilt fence carries the actual language name", async () => {
	// 嵌入 ![[note]]、hover 弹窗、导出 PDF、Canvas 卡片：宿主给的是空桩实现，恒返回
	// null。写死 chartview 会让一个 ```timeline 块复制出来的报告写成 ```chartview，
	// 粘给 agent 直接误导。
	for (const fixture of SIX) {
		clipboard.text = undefined;
		const el = await renderCodeBlock(fixture.language, fixture.source, {
			getSectionInfo: () => null,
		});
		assert.equal(query(el, ".mosaic-error"), null, fixture.language);
		query(el, '[aria-label="Copy block report"]').click();
		assert.equal(
			clipboard.text.includes("### Source\n```" + fixture.language + "\n"),
			true,
			`\`\`\`${fixture.language} was rebuilt as something else`,
		);
		assert.equal(clipboard.text.includes("- syntax: code block (source reconstructed)"), true);
		// chartview 之外的语言名一个都不该出现在别人的围栏里
		if (fixture.language !== "chartview") {
			assert.equal(clipboard.text.includes("```chartview"), false, fixture.language);
		}
	}
});

test("the chartview alias rebuilds its own fence, not the canonical one", async () => {
	clipboard.text = undefined;
	await renderCodeBlock("chartview", SIX[0].source, { getSectionInfo: () => null }).then((el) =>
		query(el, '[aria-label="Copy block report"]').click(),
	);
	// 用户写的是 chartview，复制出来的原文就得是 chartview——原文是逐字的，不是规范化的
	assert.equal(clipboard.text.includes("### Source\n```chartview\n"), true);
	assert.equal(clipboard.text.includes("```chart\n"), false);
});
