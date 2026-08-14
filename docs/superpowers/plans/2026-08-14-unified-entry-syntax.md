# 统一入口写法（Unified Entry Syntax）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三个入口（自闭合标签、代码块、成对标签）统一为同一套属性契约与渲染管线：删除旧 `chartview` 代码块的 AntV 透传链路，代码块改为「`---` frontmatter 属性区 + 可选内联 CSV」，成对标签实现「标签体内嵌 CSV」渲染。

**Architecture:** 三段式管线不变——多入口识别 → 各入口解析处理 → 特定的渲染。三个入口各自的识别层归一为同一个数据结构 `{ attributes, csv }`（csv 为 null 表示外部 dataset 模式），随后共用同一条解析（`buildChartFromTag` / `buildChartFromInline`）与渲染（`ChartFigure`）路径。旧代码块链路（`parser.ts` 的 YAML/`options:` 透传、wordcount、dataviewjs、模板、向导、CSV 导入命令）整体删除。

**Tech Stack:** TypeScript/TSX（宿主胶水）+ 纯函数 .mjs（可用 node --test 测试）+ AntV G2Plot（`@ant-design/plots` 的 Line/Column/DualAxes）+ Preact compat。

**Spec:** 本文档 §决策记录（用户已在会话中逐条确认，无独立 spec 文档）；属性契约以 `docs/dataset-guide.md` 的属性表为准。

## 决策记录（用户已确认）

1. 旧代码块写法**直接删除**，不留 legacy 兼容层（用户确认 vault 中没有旧写法文件）。
2. 三形态定位：
   - 自闭合标签 `<Chart ... />` = 引用外部 dataset（现状不变）。
   - 代码块 ```` ```chartview ```` = `---` frontmatter 属性区 + 可选 CSV 数据区；只引用外部文件时只写 frontmatter。
   - 成对标签 `<Chart ...>` + ```` ```csv ```` payload + `</Chart>` = CSV 内联写在正文里。
3. 属性名与语义以标签方式为准（`docs/dataset-guide.md` 属性表），三入口一字不差。
4. 内联（inline）模式语义：
   - 禁止 `dataset` / `from` / `to` / `granularity` / `granularityOptions` 属性（这些只对外部 dataset 有意义），出现即报错。
   - `x` 缺省取 CSV 首列；声明的 x / 系列列必须存在于 CSV 表头。
   - 数值列的值必须是数字或空（空 → null 断点），否则报错并给出行号。
   - 无溯源脚注、无粒度按钮；类型映射、单位格式化、8% 头部空间、方块图例、主题跟随与 dataset 模式完全一致。
   - 同时给出 `dataset` 与 CSV body → 报错（二选一）。

## Global Constraints

- 测试命令固定为 `npm test`（即 `node --test tests/**/*.test.mjs`；不要写成 `node --test tests/`，在 Node 22.21.1 下会失败）。
- 构建命令 `npm run build`（esbuild bundle → main.js）。
- 纯函数放 `src/dataset/*.mjs`，宿主胶水放 .ts/.tsx；.mjs 不得 import obsidian。
- 代码块语言名固定 `chartview`；错误框类名 `mosaic-error`、文案前缀 `Mosaic: `。
- 主题切换机制不得改动：`mosaic:theme-change` CustomEvent 就地换肤，**绝不能**改回 `rerender(true)`（与阅读视图虚拟化竞态会丢图）。
- `LICENSE`（双版权行）与 `NOTICE`（git-leaf Apache-2.0 署名）不得改动。
- 文档中文撰写；技术术语保留英文；截图一律 `[待补充]` 占位，未来补图必须用一眼假的数据。
- Git：在 feature 分支上按任务分批 commit（`<type>: <summary>` + description），不推送到 main。
- 安装到 vault 需同步两处：`~/projects/mango-os/.obsidian/plugins/mosaic/` 与 `~/Library/Application Support/ObsidianPlugins/Profiles/Global/plugins/mosaic/`。

## 现状证据（File Structure 依据）

- `src/main.tsx:53` 注册旧 `MosaicProcessor`（→ `parser.ts` 的 parseConfig）；`:73-105` 三个遗留命令（Insert Template / Wizard / Import CSV）；`:111` 注册 csv 扩展到不存在的 view（无效遗留）。
- `src/parser.ts`（252 行）旧链路全部逻辑：YAML、`Plots[type]||Graphs[type]`、`options:` 字符串函数 eval、wordcount:、dataviewjs:、CSV 相对 `settings.dataPath`、MultiView。删除对象。
- `src/templates.ts` / `src/components/Modal.ts` / `src/components/ChartWizardModal.tsx` / `src/tools.ts`：只服务旧链路（模板 base64、缩略图弹窗、向导、papaparse/wordcount/insertEditor/getFolderOptions）。删除对象。
- `src/settings.tsx`：9 个设置项中仅 `showExportBtn` 被新链路（`chart-tag-processor.tsx:105`）使用，其余（theme/backgroundColor/padding×4/dataPath/wordCountFilter）只服务旧链路。
- `src/components/Chart.tsx`：`ObsidianAction`/registerInteraction/registerTheme("theme1"/"theme2")/`Graphs` 只服务旧链路；`Chart` 组件本体 + ErrorBoundary + 导出按钮被 `ChartFigure` 使用，保留。
- `src/components/ChartFigure.tsx:86`：footnote 无条件渲染 `<p>`，inline 模式无 footnote，需改为条件渲染。
- `src/dataset/chart-tag-config.mjs:159-366`：`buildChartFromTag` = queryDataset + 配置生成；配置生成部分（`const attrs = result.attributes;` 起）与 queryDataset 无耦合，可抽取共享。
- `src/dataset/chart-tag.mjs`：只识别自闭合形态；`ATTR` 正则与「inner 剥属性对后须纯空白」校验可复用于成对标签开标签。
- `src/dataset/delimited-data.mjs`：`parseDelimitedRecords(content, delimiter)` 纯函数 CSV 解析（引号/转义/BOM 齐全），内联 CSV 直接复用。
- `src/types.d.ts`：dataview 类型增强只服务 `parser.ts`；`declare module "*.mjs"` 必须保留。
- `styles.css:1-24` `.mosaic-thumbnail*` 只服务模板弹窗；`:26-41` 导出按钮样式保留（`.block-language-chartview:hover` 选择器对新代码块仍有效）。
- `package.json` dependencies 中 `file-select-dialog`（Import CSV 命令）、`js-yaml`（同上）、`papaparse`（tools.ts）、`buffer`（Modal.ts）、`@ant-design/graphs`（parser.ts/Chart.tsx 旧路径）、devDependencies 中 `obsidian-dataview`、`@types/js-yaml`、`@types/papaparse` 均随旧链路删除。
- 现有测试 52 个（6 个 .test.mjs 文件），`buildChartFromTag` 公共 API 不变，必须全部保持通过。

## 新增/修改文件总览

- Create: `src/dataset/chart-block.mjs` —— 代码块源文本 → `{ attributes, csv }`（frontmatter 解析器，纯函数）。
- Create: `src/dataset/render-chart.tsx` —— 共享渲染 helper：`{ attributes, csv }` → ChartFigure 挂载（含主题注入，从 chart-tag-processor 迁出）。
- Create: `src/dataset/chart-block-processor.tsx` —— 新代码块处理器。
- Modify: `src/dataset/chart-tag-config.mjs` —— 抽取 `buildChartFromRows` 核心，新增 `buildChartFromInline`。
- Modify: `src/dataset/chart-tag.mjs` —— `findChartTags` 支持成对形态（返回项新增 `csv` 字段）。
- Modify: `src/dataset/chart-tag-processor.tsx` —— 改用 `renderChartInto`，成对标签走 inline。
- Modify: `src/components/ChartFigure.tsx` —— footnote 可选。
- Modify: `src/main.tsx` / `src/settings.tsx` / `src/components/Chart.tsx` / `src/types.d.ts` / `styles.css` / `package.json` —— 删旧。
- Delete: `src/parser.ts`、`src/templates.ts`、`src/components/Modal.ts`、`src/components/ChartWizardModal.tsx`、`src/tools.ts`、`docs/code-block-charts.md`。
- Create: `docs/code-block.md`；Modify: `README.md`、`docs/paired-tag.md`、`docs/chart-tag.md`、`docs/dataset-guide.md`、`docs/mosaic-intro.md`、`docs/mosaic-intro-zh.md`。
- Test: `tests/chart-block.test.mjs`（新）、`tests/chart-tag-config.test.mjs`（增内联用例）、`tests/chart-tag.test.mjs`（增成对用例）。

---

### Task 0: 分支准备

**Files:** 无代码改动。

- [ ] **Step 1: 确认工作区干净并建分支**

```bash
cd ~/projects/mosaic
git status --short          # 必须为空
git branch --show-current   # 记录当前分支
git log --oneline -1 origin/main 2>/dev/null || git log --oneline -1
```

若当前分支不是 main 且 HEAD 与远端 main 一致（或当前分支即最新工作分支 feat/chart-tag-dataset-rendering 且已合并/等价于 main），从当前 HEAD 创建新分支；有疑义停下报告，不要猜：

```bash
git checkout -b feat/unified-entry-syntax
```

---

### Task 1: 代码块源文本解析器（chart-block.mjs）

**Files:**
- Create: `src/dataset/chart-block.mjs`
- Test: `tests/chart-block.test.mjs`

**Interfaces:**
- Produces: `parseChartBlock(source: string) → { attributes: Record<string,string>, csv: string | null }`。抛 `Error`（信息面向用户，英文，与现有错误风格一致）。后续 Task 4 的代码块处理器消费。

- [ ] **Step 1: 写失败测试**

```js
// tests/chart-block.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseChartBlock } from "../src/dataset/chart-block.mjs";

test("parses frontmatter-only block", () => {
	const { attributes, csv } = parseChartBlock(
		'---\ntitle: 示例趋势\ndataset: data/schema/example.dataset.json\ntype: combo\n---\n',
	);
	assert.equal(attributes.title, "示例趋势");
	assert.equal(attributes.dataset, "data/schema/example.dataset.json");
	assert.equal(attributes.type, "combo");
	assert.equal(csv, null);
});

test("parses frontmatter plus csv body", () => {
	const { attributes, csv } = parseChartBlock(
		"---\ntitle: t\nx: month\nseries: a,b\n---\nmonth,a,b\n2025-01,1,2\n",
	);
	assert.equal(attributes.series, "a,b");
	assert.equal(csv, "month,a,b\n2025-01,1,2");
});

test("strips matching surrounding quotes and keeps inner commas", () => {
	const { attributes } = parseChartBlock('---\nnote: "口径, 说明"\nunit: \'%\'\n---');
	assert.equal(attributes.note, "口径, 说明");
	assert.equal(attributes.unit, "%");
});

test("ignores blank lines and # comments in frontmatter", () => {
	const { attributes } = parseChartBlock("---\n# comment\n\ntitle: t\n---");
	assert.deepEqual(attributes, { title: "t" });
});

test("preserves attribute key case", () => {
	const { attributes } = parseChartBlock("---\n钢琴Color: #2563eb\ngranularityOptions: month,quarter\n---");
	assert.equal(attributes["钢琴Color"], "#2563eb");
	assert.equal(attributes.granularityOptions, "month,quarter");
});

test("rejects block without opening ---", () => {
	assert.throws(() => parseChartBlock("title: t\n"), /must start with/);
});

test("rejects unclosed frontmatter", () => {
	assert.throws(() => parseChartBlock("---\ntitle: t\n"), /closing/);
});

test("rejects indented (nested) attribute lines", () => {
	assert.throws(() => parseChartBlock("---\nlabels:\n  position: top\n---"), /flat|indent|no value/i);
});

test("rejects non key-value lines", () => {
	assert.throws(() => parseChartBlock("---\njust text\n---"), /expected key: value/);
});
```

注意首例：属性 key 允许非 ASCII 起始（`钢琴Color`），key 正则须用 `[^\s:]+` 而非仅 `[A-Za-z_]` 开头（标签侧 `<字段名>Label`/`<字段名>Color` 的字段名可为中文——标签的 ATTR 正则目前只允许 ASCII key，这是标签识别层的既有限制，代码块侧不复制该限制）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: FAIL，`Cannot find module .../chart-block.mjs`。

- [ ] **Step 3: 实现 parseChartBlock**

```js
// src/dataset/chart-block.mjs
// chartview 代码块源文本解析：`---` frontmatter 属性区（flat key: value）+ 可选内联 CSV。
// 属性契约与 <Chart /> 标签一字不差；这里只负责切分与取值，不做语义校验。

export function parseChartBlock(source) {
	const lines = String(source ?? "").split("\n");
	let i = 0;
	while (i < lines.length && lines[i].trim() === "") i += 1;
	if ((lines[i] ?? "").trim() !== "---") {
		throw new Error(
			'chartview block must start with a "---" attribute section (see docs/code-block.md).',
		);
	}
	let end = -1;
	for (let j = i + 1; j < lines.length; j += 1) {
		if (lines[j].trim() === "---") {
			end = j;
			break;
		}
	}
	if (end === -1) {
		throw new Error('chartview attribute section is missing its closing "---".');
	}
	const attributes = parseAttributeLines(lines.slice(i + 1, end));
	const body = lines
		.slice(end + 1)
		.join("\n")
		.trim();
	return { attributes, csv: body.length > 0 ? body : null };
}

function parseAttributeLines(attrLines) {
	const attributes = {};
	for (const raw of attrLines) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		if (/^\s/.test(raw)) {
			throw new Error(
				`Attribute lines must not be indented (flat key: value only): "${line}"`,
			);
		}
		const m = /^([^\s:]+)\s*:\s*(.*)$/.exec(line);
		if (!m) {
			throw new Error(`Invalid attribute line (expected key: value): "${line}"`);
		}
		let value = m[2].trim();
		if (value === "") {
			throw new Error(
				`Attribute "${m[1]}" has no value (nested values are not supported).`,
			);
		}
		const q = value[0];
		if ((q === '"' || q === "'") && value.length >= 2 && value.endsWith(q)) {
			value = value.slice(1, -1);
		}
		attributes[m[1]] = value;
	}
	return attributes;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: 全部 PASS（52 存量 + 9 新增）。

- [ ] **Step 5: Commit**

```bash
git add src/dataset/chart-block.mjs tests/chart-block.test.mjs
git commit -m "feat: parse chartview block as frontmatter attributes plus optional CSV

Pure parser for the unified code-block entry: '---' fenced flat
key: value attribute section (same contract as the Chart tag) and an
optional inline CSV body. No semantic validation here."
```

---

### Task 2: 配置生成核心抽取 + buildChartFromInline

**Files:**
- Modify: `src/dataset/chart-tag-config.mjs`
- Modify: `src/components/ChartFigure.tsx`（footnote 可选）
- Test: `tests/chart-tag-config.test.mjs`（追加内联用例）

**Interfaces:**
- Consumes: `parseDelimitedRecords(content)`（delimited-data.mjs）。
- Produces:
  - `buildChartFromTag({manifest, rows, attributes, granularity})` —— **签名与返回不变**（现有 52 测试回归）。
  - `buildChartFromInline({attributes, csv}) → { chartType, config, footnote: undefined, warning: undefined, granularity: "source", availableGranularities: [] }` —— Task 4 渲染层消费。
  - `BuiltChart.footnote` 变为可选（`footnote?: string`）。

- [ ] **Step 1: 写失败测试（追加到 tests/chart-tag-config.test.mjs）**

```js
import { buildChartFromInline } from "../src/dataset/chart-tag-config.mjs";

const INLINE_CSV = "month,a,b\n2025-01,120,80\n2025-02,140,\n2025-03,160,95";

test("inline: builds a line chart from csv with defaults", () => {
	const built = buildChartFromInline({
		attributes: { title: "t", x: "month", series: "a,b" },
		csv: INLINE_CSV,
	});
	assert.equal(built.chartType, "Line"); // 多系列缺省 line
	assert.equal(built.footnote, undefined);
	assert.equal(built.granularity, "source");
	assert.deepEqual(built.availableGranularities, []);
	assert.equal(built.config.xField, "period");
	// 空单元格 → null 断点
	const feb = built.config.data.find(
		(d) => d.period === "2025-02" && d.series === "b",
	);
	assert.equal(feb.value, null);
	assert.deepEqual(built.config.legend, { marker: { symbol: "square" } });
});

test("inline: x defaults to the first csv column", () => {
	const built = buildChartFromInline({
		attributes: { series: "a" },
		csv: INLINE_CSV,
	});
	assert.equal(built.chartType, "Bar" === built.chartType ? built.chartType : built.chartType); // 单系列缺省 bar → Column
	assert.equal(built.chartType, "Column");
	assert.ok(built.config.data.every((d) => typeof d.period === "string"));
});

test("inline: series defaults to all non-x columns", () => {
	const built = buildChartFromInline({ attributes: {}, csv: INLINE_CSV });
	const seriesNames = new Set(built.config.data.map((d) => d.series));
	assert.deepEqual([...seriesNames].sort(), ["a", "b"]);
});

test("inline: combo with bars and lines", () => {
	const built = buildChartFromInline({
		attributes: { type: "combo", x: "month", bars: "a", lines: "b" },
		csv: INLINE_CSV,
	});
	assert.equal(built.chartType, "DualAxes");
});

test("inline: percent unit formatter applies", () => {
	const built = buildChartFromInline({
		attributes: { x: "month", series: "a", unit: "%" },
		csv: INLINE_CSV,
	});
	assert.equal(built.config.meta.value.formatter(12.5), "12.5%");
});

test("inline: rejects dataset-only attributes", () => {
	for (const key of ["dataset", "from", "to", "granularity", "granularityOptions"]) {
		assert.throws(
			() => buildChartFromInline({ attributes: { [key]: "x" }, csv: INLINE_CSV }),
			new RegExp(key),
		);
	}
});

test("inline: rejects non-numeric series values with row number", () => {
	assert.throws(
		() =>
			buildChartFromInline({
				attributes: { x: "month", series: "a" },
				csv: "month,a\n2025-01,abc",
			}),
		/row 2.*"a".*not a number/i,
	);
});

test("inline: rejects unknown declared columns", () => {
	assert.throws(
		() => buildChartFromInline({ attributes: { x: "month", series: "nope" }, csv: INLINE_CSV }),
		/no "nope" column/,
	);
});

test("inline: rejects csv without a data row", () => {
	assert.throws(() => buildChartFromInline({ attributes: {}, csv: "month,a" }), /header row and at least one data row/);
});

test("inline: rejects duplicate header columns", () => {
	assert.throws(() => buildChartFromInline({ attributes: {}, csv: "m,a,a\n1,2,3" }), /duplicate/i);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 新用例 FAIL（`buildChartFromInline` 未导出），存量 52 PASS。

- [ ] **Step 3: 抽取核心并实现 buildChartFromInline**

在 `chart-tag-config.mjs` 顶部追加 import：

```js
import { parseDelimitedRecords } from "./delimited-data.mjs";
```

把 `buildChartFromTag` 中自 `const attrs = result.attributes;` 起到函数末尾的全部内容，原样搬入模块级内部函数（不导出）：

```js
function buildChartFromRows({ rows, attrs, attributes, xKey, common }) {
	// ……原 buildChartFromTag 后半段原样搬入，仅做三处机械替换：
	// 1) 删除原 `const attrs = result.attributes;` 与 `const xKey = attrs.x;`（改由参数传入）
	// 2) `result.rows` → `rows`（seriesKeys 回退处 + 两处 toLong 调用 + 单图 data）
	// 3) 原 `const common = {...}` 定义删除（改由参数传入），`...common` 展开保持不变
}
```

`buildChartFromTag` 收尾改为：

```js
export function buildChartFromTag({ manifest, rows, attributes, granularity }) {
	const granularityOptions = parseGranularityOptions(attributes);
	const requested = String(granularity ?? attributes.granularity ?? "auto")
		.trim()
		.toLowerCase();
	if (requested !== "auto" && !granularityOptions.includes(requested)) {
		throw new Error(
			`Granularity "${requested}" is not in granularityOptions (${granularityOptions.join(",")}).`,
		);
	}
	const result = queryDataset({
		manifest,
		rows,
		component: "Chart",
		attributes,
		granularity: requested,
		granularityOptions,
	});
	const common = {
		footnote: buildFootnote(result.meta),
		warning: buildWarning(result.meta),
		granularity: result.meta.granularity,
		availableGranularities: result.meta.availableGranularities,
	};
	return buildChartFromRows({
		rows: result.rows,
		attrs: result.attributes,
		attributes,
		xKey: result.attributes.x,
		common,
	});
}
```

新增导出：

```js
// 内联数据（代码块 CSV body / 成对标签 payload）出图：无 dataset 查询语义，
// 数据按书写顺序原样呈现；格式化/配色/头部空间/图例与 dataset 模式一致。
const DATASET_ONLY_ATTRS = ["dataset", "from", "to", "granularity", "granularityOptions"];

export function buildChartFromInline({ attributes = {}, csv }) {
	for (const key of DATASET_ONLY_ATTRS) {
		if (String(attributes[key] ?? "").trim() !== "") {
			throw new Error(
				`Inline data does not support the "${key}" attribute (dataset charts only).`,
			);
		}
	}
	const records = parseDelimitedRecords(csv);
	if (records.length < 2) {
		throw new Error("Inline CSV needs a header row and at least one data row.");
	}
	const [header, ...dataRecords] = records;
	const columns = header.map((h) => String(h).trim());
	if (new Set(columns).size !== columns.length) {
		throw new Error("Inline CSV header has duplicate column names.");
	}
	const xKey = String(attributes.x ?? columns[0]).trim();
	const declared = [
		attributes.series,
		attributes.y,
		attributes.bars,
		attributes.bar,
		attributes.lines,
		attributes.line,
	].flatMap(splitList);
	for (const name of [xKey, ...declared]) {
		if (!columns.includes(name)) {
			throw new Error(`Inline CSV has no "${name}" column.`);
		}
	}
	const rows = dataRecords.map((record, index) => {
		const row = {};
		columns.forEach((name, i) => {
			const cell = String(record[i] ?? "").trim();
			if (name === xKey) {
				row[name] = cell;
				return;
			}
			if (cell === "") {
				row[name] = null;
				return;
			}
			const n = Number(cell);
			if (!Number.isFinite(n)) {
				throw new Error(
					`Inline CSV row ${index + 2}: "${name}" value "${cell}" is not a number.`,
				);
			}
			row[name] = n;
		});
		return row;
	});
	return buildChartFromRows({
		rows,
		attrs: attributes,
		attributes,
		xKey,
		common: {
			footnote: undefined,
			warning: undefined,
			granularity: "source",
			availableGranularities: [],
		},
	});
}
```

注意 `splitList` 已存在于本文件，签名 `splitList(value) → string[]`，可直接 flatMap。

`ChartFigure.tsx` 两处小改：

```tsx
export interface BuiltChart {
	chartType: string;
	config: Record<string, unknown>;
	footnote?: string;   // ← 由必填改可选
	...
}
```

```tsx
{built.footnote && (
	<p className="mosaic-figure-footnote">{built.footnote}</p>
)}
```

- [ ] **Step 4: 跑测试确认通过（含存量回归）**

Run: `npm test`
Expected: 全部 PASS（存量 52 一个不许挂——`buildChartFromTag` 行为不变是本任务的验收核心）。

- [ ] **Step 5: Commit**

```bash
git add src/dataset/chart-tag-config.mjs src/components/ChartFigure.tsx tests/chart-tag-config.test.mjs
git commit -m "feat: build charts from inline CSV via shared config core

Extract the config-generation core of buildChartFromTag into
buildChartFromRows and add buildChartFromInline for code-block CSV
bodies and paired-tag payloads. Inline mode rejects dataset-only
attributes, defaults x to the first column, and renders without
footnote or granularity switching. buildChartFromTag API unchanged."
```

---

### Task 3: 成对标签识别（chart-tag.mjs）

**Files:**
- Modify: `src/dataset/chart-tag.mjs`
- Test: `tests/chart-tag.test.mjs`（追加）

**Interfaces:**
- Produces: `findChartTags(text)` 返回项由 `{start, end, attributes}` 变为 `{start, end, attributes, csv}`；自闭合形态 `csv: null`，成对形态 `csv: string`（fence 内容）。`isOnlyChartTags` 签名不变。
- 成对形态文法：`<Chart attr="v" ...>` + 可选空白 + ```` ```csv ````（语言标注 `csv` 或省略）+ CSV 行 + ```` ``` ```` + 可选空白 + `</Chart>`。任何不满足 → 放弃该候选（渲染原文），与现有「弃候选」语义一致。

- [ ] **Step 1: 写失败测试（追加到 tests/chart-tag.test.mjs）**

```js
const PAIRED = `<Chart title="示例" type="line" x="month" series="a,b">
\`\`\`csv
month,a,b
2025-01,120,80
\`\`\`
</Chart>`;

test("finds a paired tag with csv payload", () => {
	const tags = findChartTags(PAIRED);
	assert.equal(tags.length, 1);
	assert.equal(tags[0].attributes.title, "示例");
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

test("mixed section finds both forms and isOnlyChartTags accepts it", () => {
	const text = `<Chart dataset="a.dataset.json" />\n\n${PAIRED}`;
	const tags = findChartTags(text);
	assert.equal(tags.length, 2);
	assert.equal(tags[0].csv, null);
	assert.ok(tags[1].csv.includes("month,a,b"));
	assert.ok(isOnlyChartTags(text, tags));
});

test("open tag with non-attribute inner content is rejected", () => {
	assert.deepEqual(findChartTags('<Chart title="t" junk>\n```csv\nm,a\n1,2\n```\n</Chart>'), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 新用例 FAIL（现实现对 `<Chart ...>` 开标签直接 `break`/跳过）。

- [ ] **Step 3: 实现成对识别**

重写 `chart-tag.mjs` 主循环（`ATTR`、属性校验逻辑复用；`isOnlyChartTags` 不动）：

```js
// src/dataset/chart-tag.mjs
const OPEN_TAG = /<Chart(?=[\s/>])/g;
const ATTR = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"/g;
const PAIRED_BODY = /^\s*```(?:csv)?[ \t]*\n([\s\S]*?)\n```[ \t]*\s*$/;

export function findChartTags(text) {
	const source = String(text ?? "");
	const tags = [];
	OPEN_TAG.lastIndex = 0;
	let match;
	while ((match = OPEN_TAG.exec(source))) {
		const tag =
			matchSelfClosing(source, match.index) ?? matchPaired(source, match.index);
		if (!tag) continue; // 畸形候选：regex lastIndex 已越过 "<Chart"，不会死循环
		tags.push(tag);
		OPEN_TAG.lastIndex = tag.end;
	}
	return tags;
}

// 自闭合：<Chart ... />。语义与改造前完全一致（含属性值内不得含字面 "/>" 的既有限制）。
function matchSelfClosing(source, start) {
	const close = source.indexOf("/>", start);
	if (close === -1) return null;
	const inner = source.slice(start + "<Chart".length, close);
	const attributes = parseAttrs(inner);
	if (!attributes) return null;
	return { start, end: close + 2, attributes, csv: null };
}

// 成对：<Chart ...> + ```csv fence + </Chart>。开标签的 ">" 用引号感知扫描定位，
// 属性值里允许出现 ">"。
function matchPaired(source, start) {
	let i = start + "<Chart".length;
	let quoted = false;
	for (; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === '"') quoted = !quoted;
		else if (!quoted && ch === ">") break;
		else if (!quoted && ch === "<") return null; // 嵌套/畸形
	}
	if (i >= source.length) return null;
	const inner = source.slice(start + "<Chart".length, i);
	if (inner.trimEnd().endsWith("/")) return null; // 自闭合已在前一分支处理失败，弃
	const attributes = parseAttrs(inner);
	if (!attributes) return null;
	const closeIdx = source.indexOf("</Chart>", i + 1);
	if (closeIdx === -1) return null;
	const body = source.slice(i + 1, closeIdx);
	const m = PAIRED_BODY.exec(body);
	if (!m) return null;
	return {
		start,
		end: closeIdx + "</Chart>".length,
		attributes,
		csv: m[1],
	};
}

// inner 仅由 attr="value" 对和空白组成时返回属性表，否则 null。
function parseAttrs(inner) {
	if (inner.includes("<")) return null;
	let remainder = inner;
	ATTR.lastIndex = 0;
	let attr;
	while ((attr = ATTR.exec(inner))) {
		remainder = remainder.replace(attr[0], "");
	}
	if (remainder.replace(/\/\s*$/, "").trim().length !== 0) return null;
	const attributes = {};
	ATTR.lastIndex = 0;
	while ((attr = ATTR.exec(inner))) attributes[attr[1]] = attr[2];
	return attributes;
}
```

注意 `parseAttrs` 里 `remainder.replace(/\/\s*$/, "")`：自闭合分支传入的 inner 不带 `/`（切片止于 `/>` 之前）——保持与原实现一致：原实现校验 `remainder.trim().length !== 0`，自闭合 inner 不含尾 `/`。因此该 replace 仅为防御成对分支误传，若实现时确认两分支传入均不含尾 `/`，直接用原校验 `remainder.trim().length !== 0`，不加 replace（做减法，以实测为准）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: 全部 PASS（存量自闭合用例逐字不改仍须通过）。

- [ ] **Step 5: Commit**

```bash
git add src/dataset/chart-tag.mjs tests/chart-tag.test.mjs
git commit -m "feat: recognize paired Chart tags with fenced csv payload

findChartTags now also matches <Chart ...> + \`\`\`csv fence + </Chart>
and returns csv alongside attributes (null for self-closing tags).
Malformed candidates are skipped, same as before."
```

---

### Task 4: 共享渲染层 + 新代码块处理器 + 标签处理器接入

**Files:**
- Create: `src/dataset/render-chart.tsx`
- Create: `src/dataset/chart-block-processor.tsx`
- Modify: `src/dataset/chart-tag-processor.tsx`
- Modify: `src/main.tsx`（仅换代码块注册；命令删除留给 Task 5）

**Interfaces:**
- Consumes: `parseChartBlock`（Task 1）、`buildChartFromInline`（Task 2）、`findChartTags` 新返回shape（Task 3）、`loadDatasetForNote`、`ChartFigure`。
- Produces: `renderChartInto(plugin, host, sourcePath, {attributes, csv}, stale?) → Promise<void>`（抛错由调用方接错误框）；`createChartBlockProcessor(plugin)`。

- [ ] **Step 1: 实现 render-chart.tsx（主题注入从 chart-tag-processor 迁入）**

```tsx
// src/dataset/render-chart.tsx
// 三入口共享的渲染层：{attributes, csv} → ChartFigure。csv 非空走内联模式，
// 否则走 dataset 模式。抛错由各入口调用方就地渲染错误框。
import React from "react";
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

// 跟随 Obsidian 主题选择 G2 主题；背景透明，与页面底色融合。
// 主题切换由 mosaic:theme-change 事件驱动 ChartFigure 内重建，本函数被重新求值。
function currentChartTheme(): Record<string, unknown> {
	const dark = document.body.classList.contains("theme-dark");
	const theme = { ...getTheme(dark ? "dark" : "default") };
	theme.background = "transparent";
	return theme;
}

function withTheme<T extends { config: Record<string, unknown> }>(built: T): T {
	built.config.theme = currentChartTheme();
	return built;
}

export interface ChartSource {
	attributes: Record<string, string>;
	csv: string | null;
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
```

- [ ] **Step 2: chart-tag-processor.tsx 改用 renderChartInto**

删除本文件的 `currentChartTheme` / `withTheme` / `loadDatasetForNote` / `buildChartFromTag` / `parseGranularityOptions` / `ChartFigure` 相关 import 与 for 循环体内的构建逻辑，for 循环改为：

```tsx
for (const tag of tags) {
	if (stale()) return;
	const host = el.createDiv({ cls: "mosaic-tag-host" });
	run.hosts.push(host);
	try {
		await renderChartInto(
			plugin,
			host,
			ctx.sourcePath,
			{ attributes: tag.attributes as Record<string, string>, csv: tag.csv ?? null },
			stale,
		);
	} catch (e) {
		if (stale()) return;
		host.createDiv({
			cls: "mosaic-error",
			text: `Mosaic: ${String((e as Error)?.message ?? e)}`,
		});
	}
}
```

代际 token、hosts unmount、`MarkdownRenderChild`、fast-path、`isOnlyChartTags` 全部保持不变。原「Chart tag without dataset= is not supported yet」错误分支删除（由 renderChartInto 的新错误文案覆盖）。

- [ ] **Step 3: 实现 chart-block-processor.tsx**

```tsx
// src/dataset/chart-block-processor.tsx
// chartview 代码块入口：frontmatter 属性 + 可选内联 CSV，语义与 <Chart /> 标签一致。
import ReactDOM from "react-dom";
import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import MosaicPlugin from "../main";
import { parseChartBlock } from "./chart-block.mjs";
import { renderChartInto } from "./render-chart";

export function createChartBlockProcessor(plugin: MosaicPlugin) {
	return async (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) => {
		const host = el.createDiv({ cls: "mosaic-tag-host" });
		const child = new MarkdownRenderChild(el);
		child.onunload = () => ReactDOM.unmountComponentAtNode(host);
		ctx.addChild(child);
		try {
			const parsed = parseChartBlock(source);
			await renderChartInto(plugin, host, ctx.sourcePath, parsed);
		} catch (e) {
			ReactDOM.unmountComponentAtNode(host);
			host.empty();
			host.createDiv({
				cls: "mosaic-error",
				text: `Mosaic: ${String((e as Error)?.message ?? e)}`,
			});
		}
	};
}
```

- [ ] **Step 4: main.tsx 换注册**

删除 `MosaicProcessor` 方法及其 `parseConfig`/`Chart` import，注册行改为：

```tsx
import { createChartBlockProcessor } from './dataset/chart-block-processor';
...
this.registerMarkdownCodeBlockProcessor("chartview", createChartBlockProcessor(this));
```

（Insert Template / Wizard / Import CSV 命令与其 import 本任务不动，Task 5 统一删，保证每个任务结束时 build 都是绿的。）

- [ ] **Step 5: 测试 + 构建**

Run: `npm test && npm run build`
Expected: 测试全 PASS；esbuild 无错误产出 main.js。

- [ ] **Step 6: Commit**

```bash
git add src/dataset/render-chart.tsx src/dataset/chart-block-processor.tsx src/dataset/chart-tag-processor.tsx src/main.tsx
git commit -m "feat: unify all entries onto one attributes-to-figure render path

Add renderChartInto shared by the tag post-processor and a new
chartview block processor (frontmatter + optional inline CSV). Paired
tags with csv payloads now render via the inline path. The legacy
YAML/options code-block chain is no longer reachable."
```

---

### Task 5: 删除遗留链路

**Files:**
- Delete: `src/parser.ts`、`src/templates.ts`、`src/components/Modal.ts`、`src/components/ChartWizardModal.tsx`、`src/tools.ts`
- Modify: `src/main.tsx`、`src/settings.tsx`、`src/components/Chart.tsx`、`src/types.d.ts`、`styles.css`、`package.json`（+ 重新生成 lock）

**Interfaces:**
- Consumes: Task 4 之后旧链路已无运行时入口。
- Produces: `MosaicPluginSettings` 缩为 `{ showExportBtn: boolean }`（`render-chart.tsx` 唯一消费者）。

- [ ] **Step 1: 删文件与命令**

```bash
git rm src/parser.ts src/templates.ts src/components/Modal.ts src/components/ChartWizardModal.tsx src/tools.ts
```

`src/main.tsx` 删除：
- import：`fileDialog`、`js-yaml`、`insertEditor, parseCsv`、`ChartTemplateSuggestModal`、`ChartWizardModal`。
- 三个 `addCommand` 块（insert-mosaic-template / mosaic-wizard / import-mosaic-data-csv）及 `Platform` import（若不再使用）。
- `CSV_FILE_EXTENSION`/`VIEW_TYPE_CSV` 常量与 `registerExtensions([CSV_FILE_EXTENSION], VIEW_TYPE_CSV)` try/catch（注册到不存在 view 的无效遗留）。**保留** mdx 注册。

- [ ] **Step 2: settings.tsx 缩减**

```tsx
import { App, PluginSettingTab, Setting } from 'obsidian';
import MosaicPlugin from "./main";

export interface MosaicPluginSettings {
	showExportBtn: boolean;
}

export const DEFAULT_SETTINGS: MosaicPluginSettings = {
	showExportBtn: false,
};

export class MosaicSettingTab extends PluginSettingTab {

	constructor(app: App, private plugin: MosaicPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Mosaic Settings' });

		new Setting(containerEl)
			.setName("Show Export Button")
			.setDesc("Show a PNG export button when hovering a chart.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showExportBtn)
				.onChange(async (value) => {
					this.plugin.settings.showExportBtn = value;
					await this.plugin.saveSettings();
				}));
	}
}
```

`main.tsx` 的 `loadSettings` 改为不污染缺省对象：

```tsx
this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
```

（用户 data.json 里的旧字段会被原样带进内存与落盘，无害，不写迁移代码。）

- [ ] **Step 3: Chart.tsx 清理**

删除：`Graphs` import 与 `Plots[type] || Graphs[type]` 中的 Graphs 回退（改为 `const Component = Plots[type];`，type 只会是 Line/Column/DualAxes）、`ObsidianAction` 类、`registerAction`/`registerInteraction`/`registerTheme`/`compactTheme`、四个 `*_WRAPPER` 常量、`LooseObject` import、`@antv/g2` import 中不再使用的符号。保留：`ChartProps`/`ConfigProps`/`DataType`、`ErrorBoundary`、导出按钮、`Chart` 组件本体。

- [ ] **Step 4: types.d.ts、styles.css**

`src/types.d.ts` 全文替换为：

```ts
declare module "*.mjs";
```

`styles.css` 删除 `.mosaic-thumbnail-container` / `.mosaic-thumbnail` 相关规则（文件头部到导出按钮规则之前的 thumbnail 段）；其余保留。

- [ ] **Step 5: package.json 依赖清理**

dependencies 移除：`file-select-dialog`、`js-yaml`、`papaparse`、`buffer`、`@ant-design/graphs`。
devDependencies 移除：`@types/js-yaml`、`@types/papaparse`、`obsidian-dataview`。

```bash
npm install   # 重新生成 package-lock.json
```

- [ ] **Step 6: 全仓残留扫描 + 测试 + 构建**

```bash
grep -rn "dataview\|wordcount\|papaparse\|js-yaml\|file-select\|ChartWizard\|ChartTemplate\|insertEditor\|getWordCount\|dataPath\|backgroundColor\|wordCountFilter" src/ styles.css package.json esbuild.config.mjs manifest.json
```

Expected: 无输出（或仅剩无关紧要的注释残留，一并清掉）。

Run: `npm test && npm run build`
Expected: 全 PASS，构建成功。留意 bundle 应明显变小（@ant-design/graphs 被剔除）。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove the legacy code-block chain

Delete parser.ts (YAML/options passthrough, wordcount, dataviewjs,
settings-relative CSV), templates, wizard, CSV import command and the
settings that only served them. Settings shrink to showExportBtn.
Drop now-unused deps: @ant-design/graphs, papaparse, js-yaml, buffer,
file-select-dialog, obsidian-dataview.

Impact: old-style chartview blocks (type/data/options YAML) no longer
render; the vault has no such blocks (confirmed by USER)."
```

---

### Task 6: 文档统一

**Files:**
- Delete: `docs/code-block-charts.md`
- Create: `docs/code-block.md`
- Modify: `README.md`、`docs/paired-tag.md`、`docs/chart-tag.md`、`docs/dataset-guide.md`、`docs/mosaic-intro.md`、`docs/mosaic-intro-zh.md`

- [ ] **Step 1: 新建 docs/code-block.md**

内容框架（中文，遵循 document-formatting；效果图一律 `![待补充]`，示例数据必须一眼假）：

```markdown
# 代码块（chartview）

> `chartview` 代码块入口：`---` frontmatter 属性区 + 可选内联 CSV。属性契约与
> [[docs/chart-tag|自闭合标签]] 一字不差，同一属性写成标签或代码块渲染结果完全一致。

## 基本写法

**引用外部数据集（只写 frontmatter）**

（```chartview 围栏示例：--- 包住 title/dataset/type/x/series/granularityOptions 等，
与 dataset-guide 属性表一致；说明 dataset 路径相对当前笔记）

**内联 CSV（frontmatter + 数据区）**

（```chartview 围栏示例：frontmatter 去掉 dataset，`---` 结束后直接跟
month,a,b 表头与几行假数据）

## 属性

- 属性表与 [[docs/dataset-guide|dataset-guide.md]] 完全一致，此处不重复。
- frontmatter 为扁平 key: value，一行一个；值可用引号包裹；`#` 行为注释。
- 不支持嵌套结构；这是声明式契约，不是 AntV 配置透传。

## 内联模式的边界

- 不支持 `dataset` / `from` / `to` / `granularity` / `granularityOptions`（这些属于外部数据集语义）。
- `x` 缺省取 CSV 首列；声明的列必须存在于表头。
- 数值列必须是数字或留空（空 → 断点）；否则报错并给出行号。
- 无溯源脚注、无粒度按钮；格式化、配色、主题跟随与 dataset 模式一致。

## 渲染效果

- ![待补充]

## 相关文档

（链 chart-tag / paired-tag / dataset-guide）
```

```bash
git rm docs/code-block-charts.md
```

- [ ] **Step 2: README.md 更新**

- Entries 表替换为：

```markdown
| Entry | Syntax | Data |
| --- | --- | --- |
| Chart tag (self-closing) | `<Chart ... />` in md / mdx body | External dataset manifests (`.dataset.json`) with time-range filtering and granularity rollup |
| Chart tag (paired) | `<Chart ...>` + fenced CSV + `</Chart>` | Inline CSV in the note body |
| Code block | ```` ```chartview ```` with `---` frontmatter | External dataset manifests, or inline CSV below the frontmatter |
| Other block types (MetricGrid, DataTable, Card) | Paired tags | Planned |
```

- 文档索引行 `Code-block charts` 改为指向 `docs/code-block.md`，描述改为 unified frontmatter + inline CSV；`Paired tag` 行去掉 planned 表述、描述 Chart 已可用其余类型 planned。
- 上游两张示意图保留不动。

- [ ] **Step 3: docs/paired-tag.md 重写状态**

- 标题去「（计划中）」；开头引言改为「Chart 内联数据已可用；MetricGrid / DataTable / Card 计划中」。
- `<Chart>` 内嵌 CSV 示例改为「当前可用」并补齐边界说明（同 code-block.md 内联模式边界 + 「标签体内不能有空行」「fence 语言标注 `csv` 可省略」「整段只能有标签与空白」）。
- 「规划的内容块类型」表：`Chart`（内联数据）状态改「已可用」，其余保持计划中。
- 渲染效果保持 `![待补充]`。

- [ ] **Step 4: docs/chart-tag.md、docs/dataset-guide.md、docs/mosaic-intro*.md 更新**

- `chart-tag.md`：「边界与限制」中补一行「需要内联数据时用成对形态，见 paired-tag.md」；「相关文档」对 paired-tag 的描述去掉「（计划中）」。
- `dataset-guide.md`：「计划中」小节删除「成对标签形态」与「代码块入口的 `dataset:` 前缀」两条（已完成，且代码块最终形态是 frontmatter 而非 `dataset:` 前缀），保留 Live Preview 与其他内容块类型两条；正文首段「Chart 标签」处补一句三入口共用本契约。
- `mosaic-intro.md` / `mosaic-intro-zh.md`：grep「代码块 / code block / paired / 成对」相关 Roadmap 条目，把「统一写法 / 成对标签 Chart 内联」相关项标记完成（en 为 source of truth，先改 en 再同步 zh）。

- [ ] **Step 5: 全仓关键词复查 + Commit**

```bash
grep -rn "wizard\|Wizard\|Insert Template\|dataviewjs\|wordcount\|Data Folder\|dataPath" README.md docs/
```

Expected: 无残留（`docs/code-block-charts.md` 已删）。

```bash
git add -A
git commit -m "docs: document the unified entry syntax

Replace code-block-charts.md with code-block.md (frontmatter + inline
CSV), mark the paired Chart tag as available, refresh README entries
and cross-links, prune completed roadmap items."
```

---

### Task 7: 构建安装 + 手动回归验证 + 收尾

**Files:** 无源码改动；产物同步到两处 vault 安装位置；更新记忆文件。

- [ ] **Step 1: 构建并安装到两处**

```bash
cd ~/projects/mosaic && npm run build
```

用 obsidian-cli 先 disable 插件，然后：

```bash
cp main.js manifest.json styles.css ~/projects/mango-os/.obsidian/plugins/mosaic/
cp main.js manifest.json styles.css "$HOME/Library/Application Support/ObsidianPlugins/Profiles/Global/plugins/mosaic/"
```

再 enable。两处文件必须一致（settings-profiles 插件会用 profile 存储恢复文件）。

- [ ] **Step 2: 回归存量页面**

打开 mango-os `growth/reports/` 下既有 Chart 标签报告页，确认全部图表照常渲染（粒度按钮、主题切换、脚注均正常）。以**截图**为准，不轻信 obsidian-cli eval 的 DOM 查询（后台 leaf 会返回空 section 假象）。

- [ ] **Step 3: 新语法验证笔记**

在 mango-os 临时位置建一页测试笔记（数据必须一眼假，如 指标A/指标B、120/140/160），覆盖：

1. 代码块 + dataset 引用（frontmatter only）→ 与等价自闭合标签渲染一致（含粒度按钮）。
2. 代码块 + 内联 CSV → 出图、无脚注、无粒度按钮。
3. 成对标签 + ```csv payload → 出图。
4. 错误路径各一：代码块缺 `---`；内联写 `granularity=`；成对标签 body 无 fence（应渲染原文）。

截图请 USER 检查。验证后删除测试笔记。若成对标签因 Obsidian 分段（标签体被拆成多个 section）不渲染：这是识别层风险点，停下报告现象与 section 切分证据，不要盲改。

- [ ] **Step 4: 更新记忆文件**

`~/.claude/projects/-Users-gilbertzzzzzzzzz-projects-mosaic/memory/mosaic-project-context.md`：代码块条目更新为「chartview 代码块已是 frontmatter + 可选内联 CSV 的统一形态（2026-08-14），旧 YAML type/data/options 写法已删除，模板/向导/CSV 导入命令已删除，settings 仅剩 showExportBtn」。

- [ ] **Step 5: 汇报并等待 USER 决定是否 ship**

按 Git Protocol，push 与 PR 由 USER 触发（「commit」「push」「ship」）；本任务结束时只汇报 branch、commit 列表与验证结果。

---

## Self-Review 记录

- Spec coverage：决策记录 1（删旧）→ Task 5；决策 2 代码块形态 → Task 1+4；决策 2 成对标签 → Task 3+4；决策 3 契约统一 → Task 2 共享核心 + Task 6 文档；决策 4 内联语义八条 → Task 2 测试逐条覆盖。无缺口。
- Placeholder scan：Task 6 的 code-block.md 给的是内容框架（文档任务，执行者按框架撰写成文），其余任务代码均为可落盘实现，无 TBD。
- Type consistency：`renderChartInto(plugin, host, sourcePath, {attributes, csv}, stale?)` 在 Task 4 定义、Task 4 两处消费一致；`buildChartFromInline({attributes, csv})` Task 2 定义、Task 4 消费一致；`findChartTags` 返回 `csv` 字段 Task 3 定义、Task 4 消费一致；`BuiltChart.footnote?` Task 2 内自洽。
