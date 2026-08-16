// tests/block-chrome.test.mjs
// Task 14 / 15 的**行为**测试：按钮真的渲染出来、真的点得下去、点完真的发生了该发生
// 的事。断言的是效果不是形状——这份 plan 从 Task 0 起就在还这笔账（一段配置测试
// 断言通过、能力从未生效）。
// 组件是 .tsx，node 跑不了，所以先经 esbuild 打包（tests/helpers/bundle.mjs），
// 宿主 API 与图表引擎换成替身；DOM 是 tests/helpers/dom.mjs 那份最小实现。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
	TFile,
	ChartFigure,
	createBlockProcessor,
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

// 五类非 Chart 区块的最小可渲染样本：外壳 class 词根 + 一份 body + 「内容区里那件
// 只有渲染态才有的东西」的选择器。头部统一到一层之后，这五类走的是同一条路，所以
// 关于框体 / 标题 / 按钮组的断言都在这张表上遍历，而不是各写五遍。
const FIVE_BLOCKS = [
	{
		name: "Timeline",
		block: "timeline",
		body: "```csv\ndate,title\n2026-01,a\n```",
		content: ".mosaic-timeline-item",
	},
	{
		name: "MetricGrid",
		block: "metric-grid",
		body: "```csv\nlabel,value\na,1\n```",
		content: ".mosaic-metric-item",
	},
	{
		name: "DecisionBox",
		block: "decision-box",
		body: "```csv\nlabel,value\na,1\n```",
		content: ".mosaic-decision-list",
	},
	{
		name: "DataTable",
		block: "data-table",
		body: "```csv\na,b\n1,2\n```",
		content: "table",
	},
	{
		name: "FlowDiagram",
		block: "flow-diagram",
		body: '```json\n{"nodes":[{"id":"a","label":"A"}]}\n```',
		content: "svg",
	},
];

const TITLE = "Quarterly review";

async function mountBlock({ name, body }, attributes = { title: TITLE }) {
	const host = mountHost();
	await renderComponentInto(
		fakePlugin(),
		host,
		{ ...CONTEXT, raw: `<${name} title="${TITLE}" />`, syntax: "self-closing tag" },
		{ name, attributes, body },
	);
	await flush();
	return host;
}

const toggle = (host, label) => query(host, `[aria-label="${label}"]`).click();

// 一张 DataTable 只有一套呈现，与它多大无关。曾经有一层「复杂度自动判定」：行数
// 或列数过了阈值就自动长出过滤框、冻结首列勾选框、Copy CSV 按钮和表头吸顶，于是
// 同样是 DataTable，读者会看到两种不同的组件。触发线是数据的物理尺寸，与「这张表
// 需不需要这些功能」无关——实测 真实笔记库 的 49 张真实表里只有 4 张越线，还全是
// 同一份数据。整套连同 complexity= 属性一起删了。
// 布局适配（fit / wrap / scroll）不在此列：那是同样的内容在不同宽度下的摆放，留着。
test("every DataTable renders the same way, whatever its size", async () => {
	const head = "a,b,c";
	const small = [head, "1,2,3"].join("\n");
	const huge = [head, ...Array.from({ length: 200 }, (_, i) => `${i},${i},${i}`)].join("\n");

	// dom.mjs 的选择器没有后代组合子，先拿到卡片再在它里面数。
	const shapeOf = (host) => {
		const card = query(host, ".table-card");
		return {
			toolbar: queryAll(host, ".table-toolbar").length,
			search: queryAll(host, 'input[type="search"]').length,
			checkbox: queryAll(host, 'input[type="checkbox"]').length,
			buttons: queryAll(card, "button").length,
			cardClass: card.className,
		};
	};

	const a = shapeOf(await mountBlock({ name: "DataTable", body: small }));
	const b = shapeOf(await mountBlock({ name: "DataTable", body: huge }));

	assert.deepEqual(a, b, "两张表的呈现不一致");
	assert.equal(a.toolbar, 0, "工具栏不该存在");
	assert.equal(a.search, 0, "过滤框不该存在");
	assert.equal(a.checkbox, 0, "冻结首列的勾选框不该存在");
	assert.equal(a.buttons, 0, "表格卡片里不该有按钮");
	assert.equal(a.cardClass, "table-card", "卡片上不该挂状态 class");
});

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

// --- 头部统一到一层：标题 + 工具栏一处画，切换只换内容区 ---

test("all five non-Chart blocks still show their title in source view", async () => {
	for (const fixture of FIVE_BLOCKS) {
		const host = await mountBlock(fixture);
		const title = () => query(host, "h3.mosaic-block-title");
		assert.equal(title()?.textContent, TITLE, `${fixture.name} has no title to begin with`);

		toggle(host, "Show source");
		await flush();
		// bug 的正面反向断言。此前五类的标题各由自己的 View 画，切原文时整个区块被换成
		// 一个只有工具栏的空壳（BlockShell 没有 title 参数），标题跟着内容一起消失。
		// 现在标题在 BlockFrame 的头部里，与切换的那一层无关。
		assert.notEqual(query(host, "pre.mosaic-source-view"), null, fixture.name);
		assert.equal(title()?.textContent, TITLE, `${fixture.name} lost its title in source view`);

		toggle(host, "Show rendered block");
		await flush();
		assert.equal(title()?.textContent, TITLE, `${fixture.name} lost its title coming back`);
		// 标题只有一份：DataTable 的表内 <caption>、FlowDiagram 的 <figcaption> 都并进
		// 了这一个 h3，两处同名标题只会让人以为渲染错了。
		assert.equal(queryAll(host, ".mosaic-block-title").length, 1, fixture.name);
		assert.equal(serialize(host).includes("<caption"), false, fixture.name);
		assert.equal(serialize(host).includes("<figcaption"), false, fixture.name);
	}
});

test("the frame element and its classes are identical either side of the toggle", async () => {
	for (const fixture of FIVE_BLOCKS) {
		const host = await mountBlock(fixture);
		// 框体「一致」的机器可验形式：根节点的标签名、class、data 属性三样都不许变。
		// 此前根节点在切换时会从 <div>/<figure> 变成 BlockShell 的 <section>，边框、
		// 圆角、内边距随之全变。
		const shape = () => {
			const roots = queryAll(host, ".mosaic-block");
			assert.equal(roots.length, 1, `${fixture.name} should have exactly one frame`);
			return [
				roots[0].localName,
				roots[0].className,
				roots[0].getAttribute("data-mosaic-block"),
			];
		};
		const before = shape();
		assert.equal(before[0], "section", fixture.name);
		assert.equal(before[1].includes(`mosaic-${fixture.block}`), true, fixture.name);
		assert.equal(before[2], fixture.block, fixture.name);

		toggle(host, "Show source");
		await flush();
		assert.deepEqual(shape(), before, `${fixture.name} changed its frame in source view`);

		toggle(host, "Show rendered block");
		await flush();
		assert.deepEqual(shape(), before, `${fixture.name} changed its frame coming back`);
	}
});

test("all five keep their content, lose it to the source view, and get it back", async () => {
	for (const fixture of FIVE_BLOCKS) {
		const host = await mountBlock(fixture);
		const content = () => queryAll(host, fixture.content).length;
		// 统一头部不能把内容弄丢：五类各自那件东西照常渲染
		assert.equal(content(), 1, `${fixture.name} renders no content`);

		toggle(host, "Show source");
		await flush();
		assert.equal(content(), 0, `${fixture.name} still shows content under the source`);

		toggle(host, "Show rendered block");
		await flush();
		assert.equal(content(), 1, `${fixture.name} did not come back`);
	}
});

test("the toolbar sits in the one header row, not floated over the card", async () => {
	for (const fixture of FIVE_BLOCKS) {
		const host = await mountBlock(fixture);
		const groups = queryAll(host, ".mosaic-control-group");
		assert.equal(groups.length, 1, fixture.name);
		// 按钮组是头部的孩子，头部是根节点的第一个孩子——正常文档流，不是绝对定位到
		// 卡片右上角的浮层（那条路正是 DataTable 当年不得不当例外的原因：会盖住表头）。
		assert.equal(groups[0].parentNode.className, "mosaic-block-header", fixture.name);
		const root = query(host, ".mosaic-block");
		assert.equal(root.childNodes[0].className, "mosaic-block-header", fixture.name);
		assert.equal(queryAll(host, ".mosaic-block-toolbar").length, 0, fixture.name);
	}
});

test("DecisionBox keeps its kicker above the title and its badges beside it", async () => {
	const host = await mountBlock(FIVE_BLOCKS[2], {
		title: TITLE,
		status: "accepted",
		owner: "me",
	});
	const heading = query(host, ".mosaic-block-heading");
	assert.notEqual(heading, null);
	// 顺序是 kicker → 标题 → 徽章。kicker 独占一整行（styles.css 的 flex-basis:100%），
	// 所以 DOM 上排在标题之前就等于视觉上在标题之上；倒过来写就会跑到标题下面。
	assert.equal(heading.childNodes[0].className, "mosaic-block-kicker");
	assert.equal(heading.childNodes[0].textContent, "Decision");
	assert.equal(heading.childNodes[1].className, "mosaic-block-title");
	assert.equal(heading.childNodes[2].className, "mosaic-decision-badges");
	assert.deepEqual(
		queryAll(host, ".mosaic-decision-badge").map((b) => b.textContent),
		["accepted", "me"],
	);
	// 状态 class 仍在根节点上，切到原文视图也不变
	assert.equal(query(host, ".mosaic-block").className.includes("is-accepted"), true);
	toggle(host, "Show source");
	await flush();
	assert.equal(query(host, ".mosaic-block").className.includes("is-accepted"), true);
	assert.equal(query(host, ".mosaic-block-kicker").textContent, "Decision");
});

test("a block without a title still gets its header and its buttons", async () => {
	const host = await mountBlock(FIVE_BLOCKS[0], {});
	assert.equal(query(host, ".mosaic-block-title"), null);
	assert.equal(query(host, ".mosaic-block-heading"), null);
	// 没有标题不等于没有头部：按钮组还在，还是那一组
	assert.deepEqual(actions(host), ["Show source", "Copy block report"]);
	assert.equal(queryAll(host, ".mosaic-control-group").length, 1);
});

// --- DataTable 的 dataset 模式：粒度按钮与图标按钮同处一组 ---

const DATASET_MANIFEST = JSON.stringify({
	schemaVersion: 1,
	id: "daily",
	data: "./daily.csv",
	grain: ["date"],
	primaryKey: ["date"],
	time: { field: "date", sourceGranularity: "day" },
	fields: [
		{ name: "date", type: "date", required: true },
		{ name: "revenue", type: "integer", required: true, rollup: "sum" },
	],
});

// 跨月跨季跨年：availableGranularities 才会给出多于一档，粒度按钮才渲染得出来。
// 头两行落在同一个月，所以 day 是 4 行、month 是 3 行——粒度按钮真的改了表格内容，
// 而不是点了跟没点一样。
const DATASET_CSV = [
	"date,revenue",
	"2026-01-05,1",
	"2026-01-20,2",
	"2026-05-11,3",
	"2027-01-04,4",
].join("\n");

function datasetPlugin() {
	const files = {
		"notes/daily.dataset.json": DATASET_MANIFEST,
		"notes/daily.csv": DATASET_CSV,
	};
	return fakePlugin({
		app: {
			vault: {
				getAbstractFileByPath: (path) =>
					path in files ? Object.assign(new TFile(), { path }) : null,
				cachedRead: (file) => Promise.resolve(files[file.path]),
			},
		},
	});
}

async function mountDataset(attributes = {}, body = "") {
	const host = mountHost();
	await renderComponentInto(
		datasetPlugin(),
		host,
		{ ...CONTEXT, sourcePath: "notes/report.md", syntax: "self-closing tag" },
		{
			name: "DataTable",
			attributes: { title: TITLE, dataset: "./daily.dataset.json", ...attributes },
			body,
		},
	);
	await flush();
	return host;
}

// dataset 模式与内联 payload 互斥，body 必须为空。这条曾经不是这样：body 里可以放一个
// ```query 围栏，装 {from, to, where}。围栏删掉了——`where` 是它唯一能表达而属性表达
// 不了的东西，而全部真实笔记里一次都没人用过；围栏本身还写不进代码块（同长度的内层围栏
// 会关掉外层），白白让 DataTable 的两种写法不等价。
test("dataset mode rejects a body instead of silently ignoring it", async () => {
	const host = await mountDataset({}, '```query\n{"from":"2026-04-01"}\n```');
	assert.equal(queryAll(host, "table").length, 0);
	assert.equal(
		query(host, ".mosaic-error-message").textContent,
		"Mosaic: Provide either dataset= or an inline body, not both.",
	);
});

test("dataset mode narrows the window with from/to attributes, no fence needed", async () => {
	const host = await mountDataset({ from: "2026-04-02", granularity: "day" });
	const rows = queryAll(query(host, "tbody"), "tr").length;
	const all = queryAll(query(await mountDataset({ granularity: "day" }), "tbody"), "tr").length;
	assert.equal(rows < all, true, `from= did not narrow the window (${rows} of ${all})`);
});

test("dataset mode folds the granularity buttons into the same single group", async () => {
	const host = await mountDataset();
	const groups = queryAll(host, ".mosaic-control-group");
	// 一组按钮，不是两组挨着的小块——粒度状态在 DataTableFigure 手里，所以外框也归它
	// 渲染，否则粒度按钮又会被迫单独开一个容器。
	assert.equal(groups.length, 1);
	assert.equal(groups[0].parentNode.className, "mosaic-block-header");
	const inGroup = queryAll(groups[0], "button");
	assert.deepEqual(
		inGroup.filter((b) => b.className.includes("mosaic-granularity-btn")).map((b) => b.textContent),
		["day", "week", "month", "quarter"],
	);
	assert.equal(queryAll(groups[0], "button.clickable-icon").length, 2);
	// 粒度按钮排在图标按钮之前
	assert.equal(inGroup[0].className.includes("mosaic-granularity-btn"), true);
	assert.equal(inGroup[inGroup.length - 1].className.includes("clickable-icon"), true);
	// 表格与标题都在
	assert.equal(queryAll(host, "table").length, 1);
	assert.equal(query(host, "h3.mosaic-block-title").textContent, TITLE);
});

test("dataset mode still switches granularity, and keeps the header while showing source", async () => {
	const host = await mountDataset();
	// dom.mjs 的选择器没有后代组合子，先拿 tbody 再数它的行。
	const rowCount = () => queryAll(query(host, "tbody"), "tr").length;
	assert.equal(rowCount(), 4); // day: 一行一天

	const month = queryAll(host, ".mosaic-granularity-btn").find(
		(b) => b.textContent === "month",
	);
	month.click();
	await flush();
	assert.equal(month.className.includes("mod-cta"), true);
	assert.equal(rowCount(), 3); // 前两行并进同一个月
	assert.equal(queryAll(host, ".mosaic-control-group").length, 1);

	toggle(host, "Show source");
	await flush();
	// 切原文时头部整份不动：标题、粒度按钮、图标按钮都还在，框体也还是同一个 section
	assert.equal(query(host, "h3.mosaic-block-title").textContent, TITLE);
	assert.equal(queryAll(host, ".mosaic-granularity-btn").length, 4);
	assert.equal(queryAll(host, "table").length, 0);
	assert.equal(queryAll(host, "section.mosaic-data-table").length, 1);
});

// --- 原文视图的字号（问题 ③）---

function fontSizeIn(css, selector) {
	const at = css.indexOf(`${selector} {`);
	assert.notEqual(at, -1, `${selector} rule missing from styles.css`);
	const body = css.slice(at, css.indexOf("}", at));
	return /font-size:\s*([^;]+);/.exec(body)?.[1].trim();
}

// 表格在框内滚动、表头与首列钉住。纯 CSS 的事，node 侧没有排版引擎可问，所以断言
// 样式表本身——与上面那条原文视图字号的测试同一个路子。
test("a long table scrolls inside its own frame, with the header and first column pinned", () => {
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const ruleOf = (selector) => {
		const at = css.indexOf(`${selector} {`);
		assert.notEqual(at, -1, `${selector} rule missing from styles.css`);
		return css.slice(at, css.indexOf("}", at));
	};

	// (a) 框体限高。没有它，position: sticky 找不到高度受限的滚动祖先，top: 0 永远
	// 不触发——吸顶那条规则以前就是这么一直没生效的。
	const scroll = ruleOf(".mosaic-data-table .table-scroll");
	const maxHeight = /max-height:\s*([^;]+);/.exec(scroll)?.[1].trim();
	assert.ok(maxHeight, "表格没有高度上限，sticky 不会生效");
	assert.ok(/^\d+px$/.test(maxHeight), `max-height 该是一个确定的高度，实际是 ${maxHeight}`);

	// (b) 双向滚动：横向给宽表，纵向给长表。overflow-x 单独一个方向不够。
	const overflow = /overflow:\s*([^;]+);/.exec(scroll)?.[1].trim();
	assert.equal(overflow, "auto", `overflow 该是双向 auto，实际是 ${overflow}`);

	// (c) 表头与首列都钉住，且都是无条件的——选择器里不能再出现开关 class。
	for (const selector of [
		".mosaic-data-table thead th",
		".mosaic-data-table th:first-child,\n.mosaic-data-table td:first-child",
	]) {
		assert.ok(ruleOf(selector).includes("position: sticky"), `${selector} 没有钉住`);
	}
	// 只查活规则，不查注释——注释里留着「这两个 class 曾经存在」的来龙去脉。
	const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
	assert.equal(
		/\.is-sticky-header|\.is-first-column-frozen/.test(withoutComments),
		false,
		"钉住不该再挂在开关 class 上",
	);

	// 左上角那格同属表头与首列，层级必须压过另外两组
	const corner = ruleOf(".mosaic-data-table thead th:first-child");
	const zOf = (rule) => Number(/z-index:\s*(\d+);/.exec(rule)?.[1] ?? 0);
	assert.ok(
		zOf(corner) > zOf(ruleOf(".mosaic-data-table thead th")),
		"左上角那格会被表头盖住",
	);

	// 首列的右侧分隔线用 box-shadow 而不是 border-right：border-collapse: collapse 下
	// 边框由表格绘制，首列横向滚走时 border 会留在原地。这一条被删的那版就做对了。
	const firstColumn = ruleOf(
		".mosaic-data-table th:first-child,\n.mosaic-data-table td:first-child",
	);
	assert.ok(firstColumn.includes("box-shadow"), "首列的分隔线该用 box-shadow");
	assert.equal(/border-right:/.test(firstColumn), false, "首列用了 border-right，横滚会掉队");
	// 钉住的格子必须有不透明背景，否则数据行从底下穿过时会看到叠影
	assert.ok(firstColumn.includes("background:"), "首列没有不透明背景");
});

test("the source view follows the body text size instead of being shrunk", () => {
	// 字号是纯 CSS 的事，node 侧没有排版引擎可问，所以这里断言样式表本身。
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	const size = fontSizeIn(css, ".mosaic-source-view");
	// 关键是不再自己乘一个小于 1 的系数：等宽字体在同一 px 下已经比正文视觉小一号，
	// 再打八折就到了读不动的地步。
	const multiplier = /^([\d.]+)(em|rem)$/.exec(size ?? "");
	assert.equal(
		multiplier === null || Number(multiplier[1]) >= 1,
		true,
		`the source view is still shrunk to ${size}`,
	);
	// 跟随正文：宿主「正文字号」设置项的那个变量，读者调大字号时原文视图跟着变大。
	assert.equal(size.includes("--font-text-size"), true, size);
	// 内层 <code> 也得跟着走，否则宿主的 .markdown-rendered code 会把它压回 --code-size。
	assert.equal(fontSizeIn(css, ".mosaic-source-view code"), "inherit");
});

test("the per-block chrome that was deleted leaves no orphan rules behind", () => {
	const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
	// 三条规则各自服务于一个已经不存在的结构：绝对定位的工具栏、DecisionBox 自己的
	// 头部、DataTable 表内的 <caption>。留着就是死代码，下一个人会照着它猜结构。
	// 只匹配行首，注释里提到这些名字（解释它们为什么没了）不算。
	for (const selector of [
		".mosaic-block-toolbar",
		".mosaic-decision-header",
		".mosaic-data-table caption",
	]) {
		const anchored = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
		assert.equal(anchored.test(css), false, `orphan rule: ${selector}`);
	}
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
	const pending = createBlockProcessor(fakePlugin(), "Chart", "chartview")(
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
	await createBlockProcessor(fakePlugin(), "Chart", "chartview")(
		"---\ntype: line\n---",
		el,
		ctx,
	);
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
