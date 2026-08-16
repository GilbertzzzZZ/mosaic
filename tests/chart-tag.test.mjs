import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	applyFieldNotice,
	findChartTags,
	findComponentTags,
	isOnlyComponentTags,
	scanAttrs,
	COMPONENT_NAMES,
} from "../src/parse/chart-tag.mjs";
// Task 13 的断言要看「图出得来 + warning 点名了那个字段」，所以真的把配置造出来。
import { buildChartFromInline } from "../src/render/chart-tag-config.mjs";

const sampleTag = `<Chart
  title="Monthly signups"
  dataset="data/metrics/monthly-signups.dataset.json"
  type="line"
  x="period"
  series="Trials,Signups"
  unit="%"
  labels="all"
  from="2024-07-01"
  to="2026-07-01"
  granularity="month"
  granularityOptions="month,quarter"
  note="Signup rate = Signups / Trials; the quarterly view is the arithmetic mean of three monthly ratios."
/>`;

test("parses a real multi-line tag with case preserved", () => {
	const tags = findChartTags(sampleTag);
	assert.equal(tags.length, 1);
	const a = tags[0].attributes;
	assert.equal(a.granularityOptions, "month,quarter"); // case preserved
	assert.equal(a.series, "Trials,Signups");
	assert.equal(a.note.includes("Signups / Trials"), true); // slash inside value not truncated
	assert.equal(tags[0].start, 0);
	assert.equal(tags[0].end, sampleTag.length);
});

test("finds multiple tags and records spans", () => {
	const text = `${sampleTag}\n\n<Chart title="b" dataset="s/b.dataset.json" type="bar" x="period" series="v" />`;
	const tags = findChartTags(text);
	assert.equal(tags.length, 2);
	assert.equal(tags[1].attributes.title, "b");
});

test("ignores text without tags and unterminated tags", () => {
	assert.equal(findChartTags("plain paragraph").length, 0);
	assert.equal(findChartTags('<Chart title="x"').length, 0);
});

test("does not match ChartFoo or lowercase chart", () => {
	assert.equal(findChartTags('<ChartFoo x="1" />').length, 0);
	assert.equal(findChartTags('<chart x="1" />').length, 0);
});

test("isOnlyComponentTags accepts tags plus whitespace only", () => {
	const solo = findChartTags(sampleTag);
	assert.equal(isOnlyComponentTags(sampleTag, solo), true);
	const mixed = `before\n${sampleTag}`;
	assert.equal(isOnlyComponentTags(mixed, findChartTags(mixed)), false);
});

test("does not swallow prose into an unterminated tag with a stray closer", () => {
	const text = `<Chart title="x"\n\nsome unrelated paragraph ending with />\n\nmore content after`;
	assert.equal(findChartTags(text).length, 0);
});

const PAIRED = `<Chart title="Sample" type="line" x="month" series="a,b">
\`\`\`csv
month,a,b
2025-01,120,80
\`\`\`
</Chart>`;

test("finds a paired tag with csv payload", () => {
	const tags = findChartTags(PAIRED);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].attributes.title, "Sample");
	assert.equal(tags[0].csv, "month,a,b\n2025-01,120,80");
	assert.equal(tags[0].start, 0);
	assert.equal(tags[0].end, PAIRED.length);
});

test("self-closing tags report csv null", () => {
	const tags = findChartTags('<Chart dataset="a.dataset.json" />');
	assert.equal(tags.length, 1);
	assert.equal(tags[0].csv, null);
});

test("paired fence language tag is optional", () => {
	const bare = PAIRED.replace("```csv", "```");
	assert.equal(findChartTags(bare)[0].csv, "month,a,b\n2025-01,120,80");
});

test("paired body without a fence is rejected", () => {
	const noFence = `<Chart title="t">\nmonth,a\n2025-01,1\n</Chart>`;
	assert.deepEqual(findChartTags(noFence), []);
});

test("unclosed paired tag is rejected", () => {
	assert.deepEqual(findChartTags('<Chart title="t">\n```csv\nm,a\n```\n'), []);
});

test("mixed section finds both forms and isOnlyComponentTags accepts it", () => {
	const text = `<Chart dataset="a.dataset.json" />\n\n${PAIRED}`;
	const tags = findChartTags(text);
	assert.equal(tags.length, 2);
	assert.equal(tags[0].csv, null);
	assert.ok(tags[1].csv.includes("month,a,b"));
	assert.ok(isOnlyComponentTags(text, tags));
});

// Task 13 起，认不出的片段不再让整块作废：图照常出，片段进底部提示（见文件末尾
// 那一节的效果断言）。这里只钉住解析层的两件事——标签仍被认走、认出的属性一个不多。
test("open tag with non-attribute inner content still yields the tag", () => {
	const tags = findChartTags('<Chart title="t" junk>\n```csv\nm,a\n1,2\n```\n</Chart>');
	assert.equal(tags.length, 1);
	assert.deepEqual(Object.keys(tags[0].attributes), ["title"]);
	assert.equal(tags[0].csv, "m,a\n1,2");
});

// 仅解析器层面的宽容：Obsidian 的 HTML block 规则要求成对标签的开标签单行
// 书写（换行会被围栏切碎成多个 section，见 docs/chart.md 成对标签边界）。
test("parser-level: paired open tag tolerates attributes across lines", () => {
	const multiline = `<Chart
	title="Multi-line tag"
	type="combo"
	x="month"
	bars="MetricA"
	lines="MetricB"
>
\`\`\`csv
month,MetricA,MetricB
2025-01,120,80
\`\`\`
</Chart>`;
	const tags = findChartTags(multiline);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].attributes.title, "Multi-line tag");
	assert.equal(tags[0].attributes.bars, "MetricA");
	assert.equal(tags[0].csv, "month,MetricA,MetricB\n2025-01,120,80");
});

// --- 识别层泛化（findComponentTags）追加测试 ---

const NON_CHART_NAMES = ["DataTable", "Timeline", "DecisionBox", "MetricGrid", "FlowDiagram"];

test("recognizes a self-closing tag for each allow-listed component name", () => {
	for (const name of COMPONENT_NAMES) {
		const text = `<${name} title="t" />`;
		const tags = findComponentTags(text);
		assert.equal(tags.length, 1, `${name} self-closing should be recognized`);
		assert.equal(tags[0].name, name);
		assert.equal(tags[0].body, null);
		assert.equal(tags[0].attributes.title, "t");
		assert.equal(tags[0].start, 0);
		assert.equal(tags[0].end, text.length);
	}
});

test("recognizes a paired tag for each allow-listed component name", () => {
	for (const name of NON_CHART_NAMES) {
		const text = `<${name} title="t">\nsome body\n</${name}>`;
		const tags = findComponentTags(text);
		assert.equal(tags.length, 1, `${name} paired should be recognized`);
		assert.equal(tags[0].name, name);
		assert.equal(tags[0].body, "\nsome body\n");
		assert.equal(tags[0].end, text.length);
	}
});

test("accepts single-quoted attribute values", () => {
	const tags = findComponentTags(`<DataTable title='Sample' columns='a,b' />`);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].attributes.title, "Sample");
	assert.equal(tags[0].attributes.columns, "a,b");
});

test("accepts bare (unquoted) attribute values", () => {
	const tags = findComponentTags(`<MetricGrid title=demo cols=3 />`);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].attributes.title, "demo");
	assert.equal(tags[0].attributes.cols, "3");
});

test("does not recognize an unknown component name", () => {
	assert.equal(findComponentTags('<UnknownWidget title="t" />').length, 0);
	assert.equal(
		findComponentTags('<UnknownWidget title="t">\nbody\n</UnknownWidget>').length,
		0,
	);
});

test("paired body is raw passthrough, including a json fence, with no fence validation", () => {
	const jsonBody = '\n```json\n[{"a":1}]\n```\n';
	const tags = findComponentTags(`<Timeline title="t">${jsonBody}</Timeline>`);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].body, jsonBody);
});

test("paired body is raw passthrough for bare text with no fence at all", () => {
	const bareBody = "\njust some notes, no fence here\n";
	const tags = findComponentTags(`<DecisionBox title="t">${bareBody}</DecisionBox>`);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].body, bareBody);
});

test("Chart compat path: non-csv-fence paired Chart candidates are still dropped", () => {
	const text = `<Chart title="t">\njust prose, no fence\n</Chart>`;
	assert.deepEqual(findChartTags(text), []);
	// but the generalized layer sees the raw candidate (body untouched, no fence check)
	const generalized = findComponentTags(text).filter((t) => t.name === "Chart");
	assert.equal(generalized.length, 1);
	assert.equal(generalized[0].body, "\njust prose, no fence\n");
});

test("mixed paragraph is not swallowed by a generalized component tag", () => {
	const text = `<DecisionBox title="x"\n\nsome unrelated paragraph ending with />\n\nmore content after`;
	assert.equal(findComponentTags(text).length, 0);
});

// —— 属性名左边界 ——
// 中文属性名不支持；不支持不等于可以从中间切一刀错认成别的属性。以下两份 inner 取自
// 一批真实笔记里的标签（CJK 版是原始写法，ASCII 版是仓库里那张图现在的写法）。

const CJK_INNER =
	' title="按业务拆分" type="stacked-bar" x="month" series="零售业务,企业服务业务"' +
	' unit="万元" 零售业务Label="零售业务" 零售业务Color="#2563eb"' +
	' 企业服务业务Label="企业服务业务" 企业服务业务Color="#d97706"';

const ASCII_INNER =
	' title="按业务拆分" type="stacked-bar" x="month"' +
	' series="retailBusiness,enterpriseBusiness" unit="万元" highlight="2026-06"' +
	' labels="all" retailBusinessLabel="零售业务" retailBusinessColor="#2563eb"' +
	' enterpriseBusinessLabel="企业服务业务" enterpriseBusinessColor="#d97706"';

test("a CJK attribute name yields no attribute at all, not a sliced-off ASCII tail", () => {
	const { attributes, remainder } = scanAttrs(CJK_INNER);
	// 恰好这五个 ASCII 键，一个不多
	assert.deepEqual(Object.keys(attributes), [
		"title",
		"type",
		"x",
		"series",
		"unit",
	]);
	// 没有凭空造出 Label / Color（旧版会造出来，且两组还互相覆盖）
	assert.equal("Label" in attributes, false);
	assert.equal("Color" in attributes, false);
	assert.deepEqual(attributes, {
		title: "按业务拆分",
		type: "stacked-bar",
		x: "month",
		series: "零售业务,企业服务业务",
		unit: "万元",
	});
	// 四条中文字段完整留在未归属片段里：含字段名、等号和引号里的值
	assert.equal(
		remainder.trim(),
		'零售业务Label="零售业务" 零售业务Color="#2563eb"' +
			' 企业服务业务Label="企业服务业务" 企业服务业务Color="#d97706"',
	);
});

// Task 12 时这里断言的是「整块作废」；Task 13 把那道闸门换成了「尽力解析 + 提示」，
// 所以同一份 inner 现在要认走标签，并且只认出那五个 ASCII 键。
test("a CJK attribute name no longer voids the whole tag", () => {
	const tags = findComponentTags(`<Chart${CJK_INNER} />`);
	assert.equal(tags.length, 1);
	assert.deepEqual(Object.keys(tags[0].attributes), [
		"title",
		"type",
		"x",
		"series",
		"unit",
	]);
});

test("the ASCII spelling of the same tag parses exactly as before", () => {
	const { attributes, remainder } = scanAttrs(ASCII_INNER);
	assert.equal(remainder.trim(), "");
	// 11 个键，键序与值逐字节固定
	assert.deepEqual(Object.keys(attributes), [
		"title",
		"type",
		"x",
		"series",
		"unit",
		"highlight",
		"labels",
		"retailBusinessLabel",
		"retailBusinessColor",
		"enterpriseBusinessLabel",
		"enterpriseBusinessColor",
	]);
	assert.deepEqual(attributes, {
		title: "按业务拆分",
		type: "stacked-bar",
		x: "month",
		series: "retailBusiness,enterpriseBusiness",
		unit: "万元",
		highlight: "2026-06",
		labels: "all",
		retailBusinessLabel: "零售业务",
		retailBusinessColor: "#2563eb",
		enterpriseBusinessLabel: "企业服务业务",
		enterpriseBusinessColor: "#d97706",
	});
	// 同一份属性走完整入口，结果一致
	const tags = findChartTags(`<Chart${ASCII_INNER} />`);
	assert.equal(tags.length, 1);
	assert.deepEqual(tags[0].attributes, attributes);
});

test("attribute names must start at a whitespace boundary, not mid-token", () => {
	// 紧贴前一个值、没有分隔空白的写法：那一条整条不认（不是被切一半认成新属性），
	// 标签本身照常认走——Task 13 之后它进的是底部提示，不再让整块作废。
	const tags = findChartTags('<Chart title="a"type="line" />');
	assert.equal(tags.length, 1);
	assert.deepEqual(Object.keys(tags[0].attributes), ["title"]);
	assert.equal("type" in tags[0].attributes, false);
	// 单引号与裸值形态同样受左边界约束
	assert.deepEqual(Object.keys(scanAttrs(" 主营unit='万元' type=line").attributes), [
		"type",
	]);
});

test("the unattributed remainder is a faithful slice when the same attr text repeats", () => {
	// `unit="万元"` 出现两次：一次是中文字段的 ASCII 尾巴，一次是真属性。
	// 旧的 remainder.replace(attr[0], "") 只换第一处，会把中文字段的尾巴剥掉，
	// 剩下 ` 零售业务 unit="万元"`——既毁了原文，又谎报有一个未归属的 unit。
	const { attributes, remainder } = scanAttrs(' 零售业务unit="万元" unit="万元"');
	assert.deepEqual(attributes, { unit: "万元" });
	assert.equal(remainder.trim(), '零售业务unit="万元"');
	assert.equal(remainder.includes('零售业务unit="万元"'), true);

	// 纯 ASCII 的重复属性：两处都被剥干净，剩余只有空白
	const dup = scanAttrs(' a="1" a="1"');
	assert.deepEqual(dup.attributes, { a: "1" });
	assert.equal(dup.remainder.trim(), "");
});


// --- Task 13：尽力解析 + 底部提示无法识别的字段 ---
// 这一节测的是**效果**：给一个含未知字段的标签，能不能拿到 config，且 warning 里
// 有没有点名那个字段——而不是解析函数返回了什么形状。所以整条链都走真的：
// findChartTags → buildChartFromInline → applyFieldNotice，与 render-chart.tsx
// 的 build 闭包一字不差（那边多的只是 withTheme 一层色值注入）。

// 出图用的最小 CSV 载荷。列名与下面各条测试的 x=/series= 对齐。
const CSV_FENCE =
	"\n```csv\nmonth,revenue,cost\n2026-01,10,4\n2026-02,12,5\n```\n";
const paired = (inner, body = CSV_FENCE) => `<Chart${inner}>${body}</Chart>`;

// 解析 → 出图 → 挂提示。返回 { tags, built }，built 为 undefined 表示整块退回。
function renderPaired(text) {
	const tags = findChartTags(text);
	if (tags.length !== 1) return { tags, built: undefined };
	const built = buildChartFromInline({
		attributes: tags[0].attributes,
		csv: tags[0].csv,
	});
	applyFieldNotice(built, tags[0].attributes, tags[0].unrecognized);
	return { tags, built };
}

test("Task 13: a CJK-named field draws the chart and names all four fields", () => {
	const { tags, built } = renderPaired(
		paired(
			CJK_INNER,
			"\n```csv\nmonth,零售业务,企业服务业务\n2026-01,96.2,1.2\n2026-02,102.5,1.8\n```\n",
		),
	);
	// 图出得来
	assert.equal(tags.length, 1);
	assert.equal(built.chartType, "Column");
	assert.equal(built.config.stack, true);
	assert.equal(built.config.data.length, 4); // 2 期 × 2 系列
	// 四条**完整**进提示——不是只剩中文词
	for (const field of [
		'零售业务Label="零售业务"',
		'零售业务Color="#2563eb"',
		'企业服务业务Label="企业服务业务"',
		'企业服务业务Color="#d97706"',
	]) {
		assert.equal(
			built.warning.includes(field),
			true,
			`warning should name ${field}, got: ${built.warning}`,
		);
	}
});

test("Task 13: a misspelled attribute draws the chart and is named in the notice", () => {
	const { tags, built } = renderPaired(
		paired(' titel="x" type="line" x="month" series="revenue"'),
	);
	assert.equal(tags.length, 1);
	assert.equal(built.chartType, "Line");
	assert.equal(built.warning.includes("titel"), true);
	// 拼对的那些一个都不能被点名
	assert.equal(built.warning.includes("type"), false);
	assert.equal(built.warning.includes("series"), false);
});

test("Task 13: supported and derived attributes never show up as unknown", () => {
	const { built } = renderPaired(
		paired(
			' type="line" x="month" series="revenue,cost" unit="万元" labels="all"' +
				' highlight="2026-01" revenueLabel="营收" revenueColor="#2563eb"' +
				' costLabel="成本" costColor="#d97706" title="T" note="N"',
		),
	);
	assert.equal(built.chartType, "Line");
	assert.equal(built.warning, undefined);
});

// 漂移守卫：白名单必须覆盖出图配置真正消费的每一个属性名。新增属性忘了加进白名单，
// 用了它的每张图都会挂一条假提示——这条测试让那件事在 CI 上先红。
// 取的是消费点本身（源码里的 attrs.X / attributes.X），不是文档，也不是这份 plan。
test("Task 13: the whitelist covers every attribute chart-tag-config consumes", () => {
	const source = readFileSync(
		new URL("../src/render/chart-tag-config.mjs", import.meta.url),
		"utf8",
	);
	const consumed = [
		...new Set(
			[...source.matchAll(/\b(?:attrs|attributes)\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(
				(m) => m[1],
			),
		),
	];
	// 消费点本身也得有下限，否则正则哪天抓空了这条测试会假绿
	assert.ok(consumed.length >= 15, `only found ${consumed.length} consumers`);
	assert.equal(consumed.includes("highlight"), true);
	assert.equal(consumed.includes("labels"), true);
	const built = {};
	applyFieldNotice(built, Object.fromEntries(consumed.map((name) => [name, "x"])));
	assert.equal(
		built.warning,
		undefined,
		`whitelist is missing: ${consumed.join(", ")}`,
	);
});

test("Task 13: an oversized stray share is treated as a boundary misread", () => {
	// 认出 type="bar"（10 字符），未归属 32 字符 > 2 × 10 —— 整块退回
	const prose = '<Chart type="bar" 这段话被误当成了标签的属性区其实只是一段普通的中文说明 />';
	assert.equal(findChartTags(prose).length, 0);
	// 一个属性都没认出来时，任何未归属片段都判为误判
	assert.equal(findChartTags("讨论 <Chart 的用法，type = 折线图 />").length, 0);
	// 反向对照：同样的散文缩短到预算之内，标签就认走了（判据真的在按体量取舍，
	// 而不是撞上了别的规则）
	assert.equal(findChartTags('<Chart type="bar" 一段短说明 />').length, 1);
});

test("Task 13: prose is not mistaken for a tag", () => {
	// 段落里有 < 和 = ，但没有任何组件名
	assert.equal(
		findComponentTags("这一段里有 a < b 和 c = d，但没有任何标签。").length,
		0,
	);
	// 自闭合的右边界是 indexOf("/>") 找到的第一个 "/>"，可能跨过开标签的 ">"
	// 落到后面的散文里。未归属文本含 ">" 就是越界的证据，整块退回。
	const crossing =
		'<Chart title="a" type="bar" x="month" series="revenue">\n正文里 a = 1，还写了一个自闭合尾巴 />';
	assert.equal(findChartTags(crossing).length, 0);
	// 同样跨界、但跨到另一个标签上：inner 含 "<"，由既有那条判据挡下
	assert.equal(
		findChartTags('<Chart title="a">\n<Chart title="b" x="month" />').length,
		1,
	);
});

test("Task 13: a fully valid tag carries no notice at all", () => {
	// 自闭合 dataset 标签：12 个属性全是受支持的
	const clean = {};
	applyFieldNotice(clean, findChartTags(sampleTag)[0].attributes);
	assert.equal(clean.warning, undefined);
	// 内联标签走完整出图链路，同样一条提示都不能有
	const { built } = renderPaired(paired(' type="line" x="month" series="revenue"'));
	assert.equal(built.warning, undefined);
});

test("Task 13: the notice appends to an existing warning instead of replacing it", () => {
	// 类型写错那条提示与本项同源、同一条 warning；两者必须并存，格式与既有的
	// "; " 拼接一致。
	const { built } = renderPaired(
		paired(' type="bogus" titel="x" x="month" series="revenue"'),
	);
	assert.equal(built.warning.includes('Unknown chart type "bogus"'), true);
	assert.equal(built.warning.includes("titel"), true);
	assert.equal(built.warning.split("; ").length >= 2, true);
});

test("Task 13: the stray fragments ride beside the attribute table, not inside it", () => {
	// 片段是标签上的一个显式并列字段 tag.unrecognized，不再挂在属性表上。属性表在
	// 下游（queryDataset 的 renderAttributes、组合图的 lines/bars 书写顺序判定）被
	// 当作纯 Record<string,string> 消费，键、展开、序列化三条路都必须看不见片段。
	const [tag] = findChartTags(
		paired(' type="line" x="month" series="revenue" 中文Label="营收"'),
	);
	// 片段确实收到了，而且是原文的完整一条
	assert.deepEqual(tag.unrecognized, ['中文Label="营收"']);
	const probe = {};
	applyFieldNotice(probe, tag.attributes, tag.unrecognized);
	assert.equal(probe.warning.includes('中文Label="营收"'), true);
	// 属性表本身干净：键、展开、序列化三条路都看不见片段
	assert.deepEqual(Object.keys(tag.attributes), ["type", "x", "series"]);
	assert.deepEqual({ ...tag.attributes }, {
		type: "line",
		x: "month",
		series: "revenue",
	});
	assert.equal(
		JSON.stringify(tag.attributes),
		'{"type":"line","x":"month","series":"revenue"}',
	);
	// 关键差别：属性表被复制过一手也不影响提示——片段走的是另一条通道，不再依赖
	// 「谁也别复制这张表」这条口头约定（symbol 侧信道正是靠它才成立的）。
	const copied = {};
	applyFieldNotice(copied, { ...tag.attributes }, tag.unrecognized);
	assert.equal(copied.warning.includes('中文Label="营收"'), true);
	// 没有片段的标签，unrecognized 是空数组而不是 undefined——调用方不必判空
	const [clean] = findChartTags(paired(' type="line" x="month" series="revenue"'));
	assert.deepEqual(clean.unrecognized, []);
});

test("Task 13: no symbol side channel survives anywhere in the parser", () => {
	// 撤销确认：解析模块里不再有任何 symbol 键，也没有 defineProperty 藏东西。
	const source = readFileSync(
		new URL("../src/parse/chart-tag.mjs", import.meta.url),
		"utf8",
	);
	assert.equal(/Symbol\s*\(/.test(source), false, "no Symbol() left");
	assert.equal(/defineProperty/.test(source), false, "no hidden property left");
	// 属性表上确实没有任何 symbol 键（不可枚举的 symbol 只有这一条路查得到）
	const [tag] = findChartTags(
		paired(' type="line" x="month" series="revenue" 中文Label="营收"'),
	);
	assert.deepEqual(Object.getOwnPropertySymbols(tag.attributes), []);
});
