// tests/block-chrome.test.mjs
// Task 14 / 15 的**行为**测试：按钮真的渲染出来、真的点得下去、点完真的发生了该发生
// 的事。断言的是效果不是形状——这份 plan 从 Task 0 起就在还这笔账（一段配置测试
// 断言通过、能力从未生效）。
// 组件是 .tsx，node 跑不了，所以先经 esbuild 打包（tests/helpers/bundle.mjs），
// 宿主 API 与图表引擎换成替身；DOM 是 tests/helpers/dom.mjs 那份最小实现。
import test from "node:test";
import assert from "node:assert/strict";
import {
	document,
	domDefaults,
	flush,
	installGlobals,
	mountHost,
	query,
	queryAll,
	serialize,
} from "./helpers/dom.mjs";

// 全局必须先装好：打包产物里 preact 一被求值就会去摸 document。
const clipboard = installGlobals();
const { loadComponents } = await import("./helpers/bundle.mjs");
const {
	React,
	ChartFigure,
	createChartBlockProcessor,
	createChartTagProcessor,
	renderComponentInto,
	renderInto,
	renders,
} = await loadComponents();

const CONTEXT = {
	sourcePath: "cases/01-chart.mdx",
	lineStart: 36,
	lineEnd: 38,
	syntax: "paired tag",
	raw: '<Chart title="T" type="line" x="month" series="v">\n```csv\nmonth,v\n```\n</Chart>',
	rawIsReconstructed: false,
	pluginVersion: "1.0.0",
	appVersion: "1.13.7",
};

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

// 每次 build 返回一个全新的 built：真身也是这样（plots 会就地改写传入的配置，
// 同一个对象渲染两遍数值标签会永久消失）。
function chartFigure(props = {}) {
	let calls = 0;
	const build = () => {
		calls += 1;
		return {
			chartType: "Line",
			config: { seq: calls },
			granularity: "source",
			availableGranularities: [],
			...(props.builtExtra ?? {}),
		};
	};
	const initial = build();
	const host = mountHost();
	renderInto(
		host,
		React.createElement(ChartFigure, {
			title: "T",
			options: [],
			initial,
			build,
			showExportBtn: false,
			context: CONTEXT,
			...props,
		}),
	);
	return host;
}

const actions = (host) =>
	queryAll(host, "button.clickable-icon").map((b) => b.getAttribute("aria-label"));

// --- 按钮 ---

test("a Chart block carries three icon buttons; without the export setting, two", async () => {
	const withExport = chartFigure({ showExportBtn: true });
	await flush();
	assert.deepEqual(actions(withExport), [
		"Show source",
		"Copy block report",
		"Export to PNG",
	]);
	// 图标是宿主 lucide 库注入的那三个，不是自带 svg
	assert.deepEqual(
		queryAll(withExport, "button.clickable-icon").map((b) => b.getAttribute("data-icon")),
		["code", "copy", "image-down"],
	);
	// 三个都在同一个 .mosaic-control-group 里，与粒度按钮同处一组
	const groups = queryAll(withExport, ".mosaic-control-group");
	assert.equal(groups.length, 1);
	assert.equal(queryAll(groups[0], "button.clickable-icon").length, 3);

	// 导出开关关掉时只剩两个（切换/复制），这是既有设置项的语义，不是本任务新加的门
	const noExport = chartFigure({ showExportBtn: false });
	await flush();
	assert.deepEqual(actions(noExport), ["Show source", "Copy block report"]);
});

test("the five non-Chart blocks carry two buttons and never an export one", async () => {
	for (const [name, body] of [
		["Timeline", "```csv\ndate,title\n2026-01,a\n```"],
		["MetricGrid", "```csv\nlabel,value\na,1\n```"],
		["DecisionBox", "```csv\nlabel,value\na,1\n```"],
		["DataTable", "```csv\na,b\n1,2\n```"],
		["FlowDiagram", '```json\n{"nodes":[{"id":"a","label":"A"}]}\n```'],
	]) {
		const host = mountHost();
		await renderComponentInto(
			fakePlugin(),
			host,
			{ ...CONTEXT, syntax: "self-closing tag" },
			{ name, attributes: { title: "t" }, body },
		);
		await flush();
		assert.deepEqual(
			actions(host),
			["Show source", "Copy block report"],
			`${name} should carry exactly the toggle and the copy button`,
		);
		assert.equal(serialize(host).includes("image-down"), false, name);
		// 一组按钮，不是两组
		assert.equal(queryAll(host, ".mosaic-control-group").length, 1, name);
	}
});

test("DataTable folds its granularity buttons into the same single group", async () => {
	const host = mountHost();
	await renderComponentInto(
		fakePlugin(),
		host,
		CONTEXT,
		{ name: "DataTable", attributes: { title: "t" }, body: "```csv\na,b\n1,2\n```" },
	);
	await flush();
	const groups = queryAll(host, ".mosaic-control-group");
	assert.equal(groups.length, 1);
	assert.equal(queryAll(groups[0], "button").length, 2);
});

// --- Task 8：unit 由 DOM 呈现，不再是 y 轴标题 ---

test("a single-axis unit follows the title on the heading row", async () => {
	const host = chartFigure({ builtExtra: { unit: "万元" } });
	await flush();
	const line = query(host, "span.mosaic-figure-unit");
	assert.notEqual(line, null);
	assert.equal(line.textContent, "( 万元 )");
	// 位置：紧跟标题，同处标题行左半边——不进画布，所以不受图例布局摆布
	const heading = query(host, "div.mosaic-figure-heading");
	assert.notEqual(heading, null);
	assert.equal(line.parentNode, heading);
	assert.equal(heading.childNodes[0].className, "mosaic-figure-title");
	assert.equal(heading.childNodes[1], line);
});

test("a dual-axis chart writes both units on one line as 左 / 右", async () => {
	const host = chartFigure({ builtExtra: { leftUnit: "万元", rightUnit: "%" } });
	await flush();
	assert.equal(query(host, "span.mosaic-figure-unit").textContent, "( 万元 / % )");
});

test("a unit with no title still gets its heading slot", async () => {
	const host = chartFigure({ title: undefined, builtExtra: { unit: "万元" } });
	await flush();
	const heading = query(host, "div.mosaic-figure-heading");
	assert.notEqual(heading, null);
	assert.equal(query(host, "figcaption.mosaic-figure-title"), null);
	assert.equal(heading.childNodes[0].textContent, "( 万元 )");
});

test("the unit stays put when the source is showing", async () => {
	const host = chartFigure({ builtExtra: { unit: "万元" } });
	await flush();
	query(host, '[aria-label="Show source"]').click();
	await flush();
	// 标题行不随内容切换而改变——unit 在画布之外，没有要让开的东西
	assert.equal(query(host, "span.mosaic-figure-unit").textContent, "( 万元 )");
});

test("unit= travels from the tag all the way to the DOM line", async () => {
	// 端到端：真的解析、真的出配置、真的渲染——不喂造好的 built。引擎侧把 unit 从
	// y 轴标题改成 common 上的字段，这条测试是那份契约的另一端。
	const text = [
		'<Chart title="T" type="line" x="month" series="revenue" unit="万元">',
		"```csv",
		"month,revenue",
		"2026-01,1",
		"```",
		"</Chart>",
	].join("\n");
	const el = document.createElement("div");
	document.body.appendChild(el);
	await createChartTagProcessor(fakePlugin())(el, {
		sourcePath: "notes/unit.md",
		addChild: () => {},
		getSectionInfo: () => ({ text, lineStart: 0, lineEnd: 5 }),
	});
	await flush();
	assert.equal(query(el, "span.mosaic-figure-unit").textContent, "( 万元 )");
	// 轴标题里不该再有一份
	assert.equal(JSON.stringify(renders[renders.length - 1].config).includes('"title":"万元"'), false);
});

test("no unit= means no line at all", async () => {
	const host = chartFigure();
	await flush();
	assert.equal(query(host, "span.mosaic-figure-unit"), null);
	// 空字符串同样不占一行
	const empty = chartFigure({ builtExtra: { unit: "" } });
	await flush();
	assert.equal(query(empty, "span.mosaic-figure-unit"), null);
});

// --- 按钮的两种状态 ---

test("the toggle button looks pressed while the source is showing", async () => {
	const host = chartFigure();
	await flush();
	const toggle = () => query(host, "button.clickable-icon");
	// 弹起
	assert.equal(toggle().className, "clickable-icon");
	assert.equal(toggle().getAttribute("aria-pressed"), "false");

	toggle().click();
	await flush();
	// 按下：宿主原生的 is-active 高亮，肉眼能看出处在哪个状态
	assert.equal(toggle().className, "clickable-icon is-active");
	assert.equal(toggle().getAttribute("aria-pressed"), "true");

	toggle().click();
	await flush();
	assert.equal(toggle().className, "clickable-icon");
	assert.equal(toggle().getAttribute("aria-pressed"), "false");
});

test("the copy button answers with a checkmark, then goes back", async () => {
	const host = chartFigure();
	await flush();
	const copy = () => queryAll(host, "button.clickable-icon")[1];
	assert.equal(copy().getAttribute("data-icon"), "copy");

	copy().click();
	await flush();
	// 点了跟没点一样是不行的：图标换成对勾，标签也换
	assert.equal(copy().getAttribute("data-icon"), "check");
	assert.equal(copy().getAttribute("aria-label"), "Copied");
	// 对勾不是空头支票：确实复制了
	assert.equal(typeof clipboard.text, "string");
	assert.equal(clipboard.text.includes("Mosaic block report"), true);
});

// --- 切换：看原文，再切回 ---

test("the toggle shows the verbatim source and switches back", async () => {
	const host = chartFigure();
	await flush();
	assert.equal(query(host, "pre.mosaic-source-view"), null);
	assert.equal(queryAll(host, "[data-plot]").length, 1);

	query(host, '[aria-label="Show source"]').click();
	await flush();
	const pre = query(host, "pre.mosaic-source-view");
	assert.notEqual(pre, null);
	// 逐字原文：开标签、fence body、闭标签一个不缺
	assert.equal(pre.textContent, CONTEXT.raw);
	// 图表确实撤了，不是叠在下面
	assert.equal(queryAll(host, "[data-plot]").length, 0);
	// 按钮换了说法，图标不变（还是同一个按钮）
	assert.deepEqual(actions(host), ["Show rendered block", "Copy block report"]);

	query(host, '[aria-label="Show rendered block"]').click();
	await flush();
	assert.equal(query(host, "pre.mosaic-source-view"), null);
	// 不残留、不重复：正好一张图
	assert.equal(queryAll(host, "[data-plot]").length, 1);
});

test("switching back hands the engine a freshly built config, never the used one", async () => {
	const before = renders.length;
	const host = chartFigure();
	await flush();
	query(host, '[aria-label="Show source"]').click();
	await flush();
	query(host, '[aria-label="Show rendered block"]').click();
	await flush();
	const seen = renders.slice(before);
	// 两次渲染：首渲 + 切回
	assert.equal(seen.length, 2);
	// 关键不变量：切回来那一次是重新 build 出来的配置，不是刚交给过引擎的那一份。
	// plots 渲染时会就地改写传入的配置（把 label 搬进 labels 再删掉 label 键），
	// 同一个对象渲染两遍，数值标签会被清空且无从恢复。seq 是 build() 的调用序号：
	// 1 → 2 说明真的重算了；若切回只是复用 useMemo 的缓存值，第二次仍是 1。
	assert.equal(seen[1].config.seq, seen[0].config.seq + 1);
	assert.notEqual(seen[0].config, seen[1].config);
});

test("a non-Chart block toggles to source and back inside the same shell", async () => {
	const host = mountHost();
	await renderComponentInto(
		fakePlugin(),
		host,
		{ ...CONTEXT, raw: '<Timeline title="t">\n```csv\ndate,title\n2026-01,a\n```\n</Timeline>' },
		{ name: "Timeline", attributes: { title: "t" }, body: "```csv\ndate,title\n2026-01,a\n```" },
	);
	await flush();
	assert.equal(queryAll(host, ".mosaic-timeline-item").length, 1);

	query(host, '[aria-label="Show source"]').click();
	await flush();
	assert.equal(
		query(host, "pre.mosaic-source-view").textContent.includes("</Timeline>"),
		true,
	);
	assert.equal(queryAll(host, ".mosaic-timeline-item").length, 0);
	// 外壳还在（框体不跳），工具栏也还在
	assert.equal(queryAll(host, "section.mosaic-timeline").length, 1);
	assert.deepEqual(actions(host), ["Show rendered block", "Copy block report"]);

	query(host, '[aria-label="Show rendered block"]').click();
	await flush();
	assert.equal(queryAll(host, ".mosaic-timeline-item").length, 1);
	assert.equal(query(host, "pre.mosaic-source-view"), null);
});

// --- 复制 ---

test("the copy button puts the whole locating context on the clipboard", async () => {
	clipboard.text = undefined;
	const host = chartFigure();
	await flush();
	query(host, '[aria-label="Copy block report"]').click();
	const text = clipboard.text;
	assert.equal(text.startsWith("## Mosaic block report\n"), true);
	assert.equal(text.includes("- file: `cases/01-chart.mdx` L37–L39"), true);
	assert.equal(text.includes("- syntax: paired tag"), true);
	assert.equal(text.includes("- status: ok"), true);
	assert.equal(text.includes("- granularity: source"), true);
	assert.equal(text.includes("- mosaic 1.0.0 / obsidian 1.13.7"), true);
	assert.equal(text.includes("### Source\n" + CONTEXT.raw), true);
});

test("a chart with a notice copies the notice, and says so in the status", async () => {
	clipboard.text = undefined;
	const host = chartFigure({ builtExtra: { warning: "Unknown chart attributes: titel — ignored." } });
	await flush();
	// 提示条本身渲染出来了，而且带自己的复制按钮
	const notice = query(host, "p.mosaic-figure-warning");
	assert.notEqual(notice, null);
	assert.equal(notice.textContent.includes("titel"), true);
	query(notice, '[aria-label="Copy notice report"]').click();
	assert.equal(clipboard.text.includes("- status: notice"), true);
	assert.equal(clipboard.text.includes("### Notice\nUnknown chart attributes: titel"), true);
});

test("an overlong inline payload is truncated on the clipboard, header kept", async () => {
	clipboard.text = undefined;
	const rows = Array.from({ length: 40 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")},${i}`);
	const raw = [
		'<Chart title="Long" type="line" x="month" series="v">',
		"```csv",
		"month,v",
		...rows,
		"```",
		"</Chart>",
	].join("\n");
	const host = chartFigure({ context: { ...CONTEXT, raw } });
	await flush();
	query(host, '[aria-label="Copy block report"]').click();
	const source = clipboard.text.split("### Source\n")[1];
	const lines = source.split("\n");
	assert.equal(lines.length, 17); // 表头 + 前 10 + 省略标记 + 后 5
	assert.equal(lines[0], '<Chart title="Long" type="line" x="month" series="v">');
	assert.equal(lines[11], "… 29 lines omitted …");
	assert.equal(lines[16], "</Chart>");
});

// --- 报错栏 ---

test("a component that cannot render falls back to an error box with a copy button", async () => {
	clipboard.text = undefined;
	const host = mountHost();
	await renderComponentInto(fakePlugin(), host, CONTEXT, {
		name: "Timeline",
		attributes: {},
		body: "",
	});
	await flush();
	const box = query(host, ".mosaic-error");
	assert.notEqual(box, null);
	assert.equal(box.textContent.includes("Timeline requires CSV"), true);
	query(box, '[aria-label="Copy error report"]').click();
	assert.equal(clipboard.text.includes("- status: error"), true);
	assert.equal(clipboard.text.includes("### Error\nMosaic: Timeline requires CSV"), true);
	assert.equal(clipboard.text.includes("### Source\n" + CONTEXT.raw), true);
});

test("a chart engine crash lands in an error box that still carries the context", async () => {
	clipboard.text = undefined;
	const host = chartFigure({ builtExtra: { config: { explode: true } } });
	await flush();
	const box = query(host, ".mosaic-error");
	assert.notEqual(box, null);
	assert.equal(box.textContent.includes("canvas exploded"), true);
	// 崩溃发生在错误边界里，那里只有 message；文件 / 行号 / 原文得从上一层传进去
	query(box, '[aria-label="Copy error report"]').click();
	assert.equal(clipboard.text.includes("- file: `cases/01-chart.mdx` L37–L39"), true);
	assert.equal(clipboard.text.includes("### Error\nMosaic: canvas exploded"), true);
	assert.equal(clipboard.text.includes("### Source\n" + CONTEXT.raw), true);
});

// --- 非 Chart 五类的提示条（Task 13 留下的口子） ---

test("an unknown field on a non-Chart block is named under the block", async () => {
	const host = mountHost();
	await renderComponentInto(fakePlugin(), host, CONTEXT, {
		name: "Timeline",
		attributes: { title: "t", titel: "x" },
		body: "```csv\ndate,title\n2026-01,a\n```",
		unrecognized: ['中文Label="营收"'],
	});
	await flush();
	// 图照常出
	assert.equal(queryAll(host, ".mosaic-timeline-item").length, 1);
	const notice = query(host, "p.mosaic-figure-warning");
	assert.notEqual(notice, null);
	assert.equal(notice.textContent.includes("Unknown Timeline attributes: titel"), true);
	assert.equal(notice.textContent.includes('中文Label="营收"'), true);
	assert.equal(notice.textContent.includes("title,"), false);
});

test("a clean non-Chart block shows no notice at all", async () => {
	const host = mountHost();
	await renderComponentInto(fakePlugin(), host, CONTEXT, {
		name: "DecisionBox",
		attributes: { title: "t", owner: "me", source: "s", status: "accepted" },
		body: "```csv\nlabel,value\na,1\n```",
	});
	await flush();
	assert.equal(query(host, "p.mosaic-figure-warning"), null);
});

// --- ⚠️ 两条时序约束 ---

test("the tag entry keeps the source it took in the sync phase, after the section is recycled", async () => {
	clipboard.text = undefined;
	const text = [
		"para",
		'<Chart title="T" type="line" x="month" series="v">',
		"```csv",
		"month,v",
		"2026-01,1",
		"2026-02,2",
		"```",
		"</Chart>",
	].join("\n");
	let calls = 0;
	let recycled = false;
	const ctx = {
		sourcePath: "notes/demo.md",
		addChild: () => {},
		getSectionInfo: () => {
			calls += 1;
			// 文档被编辑后 section 会被回收替换，之后再调返回 null——按钮点下去的
			// 时刻恰恰是「那时」。
			return recycled ? null : { text, lineStart: 1, lineEnd: 7 };
		},
	};
	const el = document.createElement("div");
	document.body.appendChild(el);
	await createChartTagProcessor(fakePlugin())(el, ctx);
	await flush();
	assert.equal(calls, 1, "getSectionInfo must be called exactly once, in the sync phase");

	recycled = true;
	const host = el;
	query(host, '[aria-label="Copy block report"]').click();
	// 原文与行号都还在（同步阶段存进闭包的那一份）
	assert.equal(clipboard.text.includes("- file: `notes/demo.md` L2–L8"), true);
	assert.equal(clipboard.text.includes("- syntax: paired tag"), true);
	assert.equal(clipboard.text.includes("### Source\n" + text.split("\n").slice(1).join("\n")), true);
	assert.equal(calls, 1, "the click must not go back to getSectionInfo");
});

test("the tag entry numbers each tag in a multi-tag section from its own offset", async () => {
	clipboard.text = undefined;
	const text = [
		// 前面十行与本段无关，section 从第 10 行（0-based）起
		...Array.from({ length: 10 }, (_, i) => `filler ${i}`),
		'<Chart title="A" type="line" x="month" series="v">',
		"```csv",
		"month,v",
		"2026-01,1",
		"```",
		"</Chart>",
		'<Chart title="B" type="line" x="month" series="v">',
		"```csv",
		"month,v",
		"2026-01,1",
		"```",
		"</Chart>",
	].join("\n");
	const ctx = {
		sourcePath: "notes/two.md",
		addChild: () => {},
		getSectionInfo: () => ({ text, lineStart: 10, lineEnd: 21 }),
	};
	const el = document.createElement("div");
	document.body.appendChild(el);
	await createChartTagProcessor(fakePlugin())(el, ctx);
	await flush();
	const copies = queryAll(el, '[aria-label="Copy block report"]');
	assert.equal(copies.length, 2);
	copies[0].click();
	assert.equal(clipboard.text.includes("- file: `notes/two.md` L11–L16"), true);
	copies[1].click();
	assert.equal(clipboard.text.includes("- file: `notes/two.md` L17–L22"), true);
});

test("the code-block entry takes the section before the unbounded await, not in the catch", async () => {
	clipboard.text = undefined;
	const text = ["intro", "```chartview", "---", "type: line", "---", "```"].join("\n");
	let calls = 0;
	let recycled = false;
	const ctx = {
		sourcePath: "notes/block.md",
		addChild: () => {},
		getSectionInfo: () => {
			calls += 1;
			return recycled ? null : { text, lineStart: 1, lineEnd: 5 };
		},
	};
	const el = document.createElement("div");
	document.body.appendChild(el);
	// 宿主还没布局：renderChartInto 的第一件事是 await whenHostReady()，而它明确
	// 不设超时。这一段就是那个「等回来之后 section 早已被回收」的窗口。
	domDefaults.clientWidth = 0;
	const pending = createChartBlockProcessor(fakePlugin())(
		"---\ntype: line\n---",
		el,
		ctx,
	);
	domDefaults.clientWidth = 600;
	const host = el.childNodes[0];
	assert.equal(host.clientWidth, 0, "the host starts unlaid-out");
	// section 在等待期间被回收
	recycled = true;
	host.clientWidth = 600;
	await pending;
	await flush();

	assert.equal(calls, 1, "getSectionInfo must be called once, before the try");
	const box = query(el, ".mosaic-error");
	assert.notEqual(box, null);
	// 报错发生在 await 之后（renderChartInto 里 dataset/csv 都没有那条），此刻
	// getSectionInfo 已经返回 null——原文照样在，因为是同步阶段取的。
	assert.equal(box.textContent.includes("Chart needs dataset="), true);
	query(box, '[aria-label="Copy error report"]').click();
	assert.equal(clipboard.text.includes("- file: `notes/block.md` L2–L6"), true);
	assert.equal(clipboard.text.includes("- syntax: code block"), true);
	assert.equal(clipboard.text.includes("(source reconstructed)"), false);
	assert.equal(
		clipboard.text.includes("### Source\n```chartview\n---\ntype: line\n---\n```"),
		true,
	);
});

test("without a section info the code block rebuilds the fence and says it did", async () => {
	clipboard.text = undefined;
	const ctx = {
		sourcePath: "notes/embedded.md",
		addChild: () => {},
		// 嵌入 ![[note]]、hover 弹窗、导出 PDF、Canvas 卡片：宿主给的是空桩实现
		getSectionInfo: () => null,
	};
	const el = document.createElement("div");
	document.body.appendChild(el);
	await createChartBlockProcessor(fakePlugin())("---\ntype: line\n---", el, ctx);
	await flush();
	query(el, '[aria-label="Copy error report"]').click();
	assert.equal(clipboard.text.includes("- syntax: code block (source reconstructed)"), true);
	// 行号未知就不写一个假的
	assert.equal(clipboard.text.includes("- file: `notes/embedded.md`\n"), true);
	assert.equal(
		clipboard.text.includes("### Source\n```chartview\n---\ntype: line\n---\n```"),
		true,
	);
});
