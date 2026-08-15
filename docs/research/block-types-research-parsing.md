# 早期内部实现 MDX-lite 五类组件解析契约研究

> 证据来源：`早期内部实现` 仓库（只读研究，未修改）。核心文件：
> - `src/content/mdx-lite-syntax.mjs`（标签探测与属性解析，纯函数）
> - `src/content/mdx-lite.mjs`（渲染入口 + payload 提取 + 各组件渲染逻辑）
> - `src/content/dataset-query.mjs`（DataTable/Chart 的 dataset 查询语义，纯函数）
> - `src/content/dataset-granularity.mjs`（时间粒度纯函数，被 dataset-query.mjs 依赖）
> - `src/content/delimited-data.mjs`（CSV/TSV 解析，纯函数）
> - `src/server/dataset-loader.mjs`（.dataset.json manifest 加载与校验，服务器专属）
> - `src/content/table-complexity.mjs` / `table-layout.mjs`（DataTable 渲染态计算，非解析核心但影响输出属性）
> - `src/content/markdown.mjs`（markdown-it 集成点）
> - 测试：`test/mdx-lite.test.mjs`（624 行，覆盖全部 6 类组件）、`test/dataset-query.test.mjs`（404 行）、`test/dataset-view.test.mjs`
> - 真实示例：`docs/mdx-lite-components-demo.mdx`

本报告只覆盖 Mosaic 需要的五类：**DataTable、MetricGrid、Timeline、DecisionBox、FlowDiagram**。早期内部实现 还有第六类 `Chart`，其渲染逻辑不在范围内，但它与 DataTable 共享全部 payload 提取机制和 dataset 查询机制，因此在"共享机制"与"dataset 查询"两节会引用 Chart 分支作对照证据。

---

## 1. 共享机制（Mosaic 必须原样镜像的部分）

### 1.1 组件白名单与标签探测（`mdx-lite-syntax.mjs`）

```js
export const MDX_LITE_COMPONENT_NAMES = Object.freeze([
  "DataTable", "Timeline", "Chart", "DecisionBox", "MetricGrid", "FlowDiagram",
]);
```

标签开头正则（判断一行是否是 MDX-lite 组件开始）：

```js
/^<([A-Z][A-Za-z0-9]*)\b/
```

匹配到的名字必须在 `MDX_LITE_COMPONENT_NAME_SET` 白名单里，否则整个块被当作普通文本/HTML 转义输出（有测试验证：`<UnknownWidget dangerous="true" />` 被转义为 `&lt;UnknownWidget ...`，不会被当作组件）。

**多行开始标签支持**：`mdxLiteComponentOpeningAtLines(lines, startIndex)` 会从 `startIndex` 起最多累积 `MAX_OPENING_LINES = 100` 行、`MAX_OPENING_CHARACTERS = 32 * 1024` 字符，逐行拼接后尝试匹配开始标签，直到找到未被引号包裹的 `>` 为止（`unquotedTagEnd`）。这允许如下写法（测试 `every allowlisted MDX-lite component accepts HTML-like multiline attributes`）：

```
<DataTable
  title="Detail"
  columns="name,value"
>
```csv
...
```
</DataTable>
```

**self-closing 判断**：`>` 之前（去除首尾空白后）若以 `/` 结尾，则 `selfClosing = true`，此时属性字符串要去掉末尾这个 `/`。

**属性解析正则**（`parseMdxLiteAttributes`）：

```js
/([A-Za-z_][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g
```

即：属性名 `[A-Za-z_][A-Za-z0-9_-]*`，值必须显式赋值（无值的裸属性名不被识别），支持双引号、单引号或无引号（无引号值不能含空白、引号、`>`、`/`）。所有属性值解析结果**始终是字符串**（不做数字/布尔/JSON 自动转换——这点很关键，`columnLabels` 若直接写在标签属性里会保持为字符串，不会被当作对象，详见 §2.2）。

**闭合标签匹配**：非 self-closing 时，从开始标签结束的下一行起逐行找 `line.trim() === "</${name}>"` 的**精确匹配**（大小写敏感、必须独占一行、不允许行内还有其他字符）。找不到闭合标签则整个块不被识别为组件（回退为普通文本）。

**块内容（payload 源文本）**：开始标签结束行的下一行到闭合标签所在行之间的原始文本（`state.getLines(...)`），即 `token.content`，原样传给各组件渲染函数，不做任何预处理。

### 1.2 markdown-it 集成点（`markdown.mjs`）

```js
renderer.block.ruler.before("paragraph", "mdx_lite_component", mdxLiteBlockRule, {
  alt: ["paragraph", "reference", "blockquote"],
});
...
renderer.renderer.rules.mdx_lite_component = (tokens, index, rendererOptions, env) =>
  sourceBlockOpen(tokens[index], env) +
  renderMdxLiteComponent(tokens[index], { locale: options.locale }) +
  sourceBlockClose();
```

`mdxLiteBlockRule` 在 `paragraph` 规则之前注册为块级规则，逐行探测开始标签（复用 `mdxLiteComponentOpeningAtLines`），确定 `openingEndLine` 后向后找字面量 `</Name>` 闭合行（`findClosingLine`），构造一个 `mdx_lite_component` token，`token.meta = { name, attributes }`，`token.content` 为块体原文。渲染阶段调用 `renderMdxLiteComponent(token, { locale })`。

对 Mosaic 的启示：解析（识别标签边界 + 提取 attributes/content）与渲染（各组件的 HTML/DOM 生成）在 早期内部实现 中是两个独立阶段，且解析阶段与 markdown 引擎耦合较浅（`mdxLiteComponentOpeningAtLines`/`mdxLiteComponentBlockAtLines`/`parseMdxLiteAttributes` 全是不依赖 markdown-it 状态的纯函数，只需要一个 `lines: string[]` 数组）。这两个探测函数是 Mosaic 应该逐字节移植的核心。

### 1.3 组件入口分发（`renderMdxLiteComponent`，`mdx-lite.mjs:99-131`）

```js
if (Object.hasOwn(attributes, "dataset")) {
  return renderDatasetView(token, attributes, translate);
}
if (name === "DataTable") return renderDataTable(token.content, attributes, translate);
if (name === "Timeline") return renderTimeline(token.content, attributes, translate);
if (name === "Chart") return renderChart(token.content, attributes, translate);
if (name === "DecisionBox") return renderDecisionBox(token.content, attributes, translate);
if (name === "MetricGrid") return renderMetricGrid(token.content, attributes, translate);
if (name === "FlowDiagram") return renderFlowDiagram(token.content, attributes, translate);
```

**关键规则**：只要属性里出现 `dataset`（不论其值），组件就会**完全跳过**自身的 payload 提取逻辑，转入 `renderDatasetView`。而 `renderDatasetView` 内部只认 `DATASET_COMPONENT_NAMES = new Set(["Chart", "DataTable"])`；五类中只有 **DataTable** 支持 `dataset` 属性。若 Timeline/DecisionBox/MetricGrid/FlowDiagram 被打上 `dataset="..."` 属性，会抛出：

```
External datasets support Chart and DataTable.
```

（`renderDatasetView` 第 176-178 行）并被 `componentError` 包裹成 `<div class="mdx-component-error">`。

任何渲染函数抛出的 `Error` 都会被最外层 `try/catch`（`mdx-lite.mjs:104-128`）捕获，转成：

```js
function componentError(name, error, translate) {
  return `<div class="mdx-component-error" data-mdx-component="${escapeHtml(name || "Unknown")}">${escapeHtml(translate("component.error", { message: error.message }))}</div>`;
}
```

`component.error` 文案模板：英文 `"Failed to render MDX component: {message}"`，中文 `"MDX 组件渲染失败：{message}"`。也就是说**错误信息统一在外层拼接一层前缀，内层各处的 `throw new Error(...)` 字符串是原文透传**——这是 Mosaic 移植时应保留的精确错误字符串（下文逐类列出）。

### 1.4 Payload 提取共享函数（`mdx-lite.mjs` 底部私有函数，DataTable/Timeline/DecisionBox/MetricGrid 共用，FlowDiagram 部分复用）

#### `extractDataBlock(content)` — 围栏代码块探测

```js
const match = content.match(/^\s*```([A-Za-z0-9_-]+)?[^\n]*\r?\n([\s\S]*?)\r?\n```\s*$/);
if (!match) return null;
return { format: (match[1] || "csv").toLowerCase(), body: match[2] };
```

- 整个 `content`（组件体原文）必须**从头到尾**（允许首尾空白）就是唯一一个围栏代码块，否则返回 `null`（视为"裸文本"路径，见下）。
- 语言标签（fence info string）第一个空白前的 token 被取作 `format`；缺省语言标签时 `format` 默认为 `"csv"`。围栏起始行语言标签后面的其余字符（`[^\n]*`）被丢弃，不校验。
- 支持 `` ``` `` 三个反引号，**不支持** `~~~` 波浪线围栏，也不支持缩进代码块。
- 结尾要求独占一行的 `` ``` `` （前面允许空白）。

#### `extractRows(content)` — 行级数据提取（DataTable / Timeline / DecisionBox / MetricGrid 共用；Chart 也用它）

```js
function extractRows(content) {
  const dataBlock = extractDataBlock(content);
  if (dataBlock) {
    if (dataBlock.format === "json") return rowsFromJson(dataBlock.body);
    if (dataBlock.format === "tsv") return rowsFromDelimited(dataBlock.body, "\t");
    return rowsFromDelimited(dataBlock.body, ",");   // 任何非 json/tsv 语言标签都当 CSV 处理
  }
  const trimmed = content.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return rowsFromJson(trimmed);
  if (trimmed.includes("|")) return rowsFromMarkdownTable(trimmed);
  return rowsFromDelimited(trimmed, ",");
}
```

三条判定路径：
1. **有围栏代码块**：`json` → JSON 解析；`tsv` → Tab 分隔；其余（包括 `csv`、无语言标签、甚至写 `python` 这种无关标签）一律按逗号 CSV 解析——**语言标签只在 json/tsv 时生效，否则一律退化为 CSV**，这是容易被忽视的细节。
2. **无围栏、裸文本以 `[` 或 `{` 开头**：整体当 JSON 解析。
3. **无围栏、裸文本含 `|` 字符**：当 Markdown 表格解析。
4. **兜底**：裸文本按逗号 CSV 解析。

#### `rowsFromJson(content)`

```js
function rowsFromJson(content) {
  const parsed = JSON.parse(content);           // 解析失败直接抛 SyntaxError，未被包装成业务错误
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === "object");
}
```

接受两种顶层结构：JSON 数组本身即行数组；或 `{ "rows": [...] }` 对象。数组元素中非对象项被静默丢弃（不报错）。

#### `rowsFromDelimited(content, delimiter)`（CSV `,` / TSV `\t`）

```js
function rowsFromDelimited(content, delimiter) {
  const records = parseDelimitedRecords(content.trim(), delimiter);
  if (records.length < 2) return [];             // 只有表头（或空）→ 空数组，不报错
  const headers = records[0].map((h) => String(h).trim());
  return records.slice(1)
    .filter((record) => record.some((v) => String(v).trim() !== ""))   // 跳过全空行
    .map((record) => Object.fromEntries(headers.map((h, i) => [h, parseCell(record[i] ?? "")])));
}
```

`parseCell` 数值嗅探（`mdx-lite.mjs:1236-1241`）：

```js
function parseCell(value) {
  const text = String(value).trim();
  if (text === "") return "";
  const number = Number(text);
  return Number.isFinite(number) && /^-?\d+(?:\.\d+)?$/.test(text) ? number : text;
}
```

即只有严格匹配 `^-?\d+(?:\.\d+)?$`（纯整数或小数，无千分位逗号、无指数记法、无百分号/单位）的单元格才会被转成 JS number；其余（包括空字符串、日期、"12%"、"1,234"）保持为字符串。

`parseDelimitedRecords`（`delimited-data.mjs`，标准 RFC4180 风格状态机）：
- 只支持 `,` 或 `\t` 作分隔符，否则抛 `"Delimited data supports only CSV and TSV."`。
- 支持双引号包裹字段、`""` 转义内部引号、`\r\n`/`\n`/`\r` 行结束符、开头 BOM `﻿` 自动剥离。
- 未闭合的引号字段抛 `"Delimited data contains an unterminated quoted field."`。
- 最终过滤掉完全空的行（`record.some((v) => String(v).length > 0)`）。

#### `rowsFromMarkdownTable(content)`

```js
function rowsFromMarkdownTable(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  if (lines.length < 3) return [];   // 少于"表头+分隔行+至少1数据行"→ 空数组
  const headers = splitMarkdownRow(lines[0]);
  return lines.slice(2).map((line) => {   // 注意：直接跳过 lines[1]（分隔行 |---|---|），不校验其内容
    const cells = splitMarkdownRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, parseCell(cells[i] ?? "")]));
  });
}
function splitMarkdownRow(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}
```

只保留以 `|` 开头（trim 后）的行，第 0 行是表头，第 1 行（分隔行）被无条件跳过且不校验格式，第 2 行起是数据。单元格按 `|` 切分，两端多余的边界 `|` 被 strip 掉。不处理转义的 `\|`。

**共享机制小结（Mosaic 必须逐字节镜像的函数列表）**：
- `mdxLiteComponentOpeningAtLines` / `mdxLiteComponentBlockAtLines` / `parseMdxLiteAttributes` / `unquotedTagEnd`（来自 `mdx-lite-syntax.mjs`，纯函数，零依赖）
- `extractDataBlock` / `extractRows` / `rowsFromJson` / `rowsFromDelimited` / `rowsFromMarkdownTable` / `parseCell`（来自 `mdx-lite.mjs`，纯函数但当前是模块私有，Mosaic 需要重新实现——逻辑要求逐字节一致）
- `parseDelimitedRecords`（`delimited-data.mjs`，纯函数，零依赖，**建议整体照搬**）
- `listAttribute` / `uniqueStrings`（逗号分隔属性 → 去重字符串数组，`v => String(v).split(",").map(s=>s.trim()).filter(Boolean)`，再 `[...new Set(...)]`）——DataTable 的 `columns` 属性用它。
- `escapeHtml`（`&` `<` `>` `"` 转义，不转义 `'`）——如果 Mosaic 输出 HTML/DOM 需要对齐转义策略；若用 Obsidian 的 DOM API 直接创建元素则可绕过。

---

## 2. DataTable

### 2.1 标签形式

- **成对标签**是主要形式：`<DataTable ...>` + fenced payload + `</DataTable>`。
- **self-closing** 仅在 dataset 模式下常见（`<DataTable dataset="..." .../>`），因为此时 body 允许为空。
- Payload 支持 fenced ```csv / ```tsv / ```json，以及**裸文本**（JSON / 竖线 Markdown 表格 / 裸 CSV），走 §1.4 的通用 `extractRows`。
- `renderDataTable(content, attributes, translate)` = `renderDataTableRows(extractRows(content), attributes, translate)`。也存在独立入口 `renderMdxLiteRows("DataTable", rows, attributes, {locale})`，直接接收已解析好的 `rows` 数组（跳过 payload 提取），这是给 dataset 查询结果复用的路径（见 §4）。

### 2.2 属性完整清单

| 属性 | 语义 | 默认值/行为 | 校验 |
|---|---|---|---|
| `title` | 表格标题，渲染为 `<caption>` | 无标题则不渲染 caption | 无 |
| `columns` | 逗号分隔的列名列表，覆盖自动推断的列顺序 | 未设置时 = 所有行 key 的并集（按行遍历顺序首次出现的顺序，`[...new Set(rows.flatMap(row => Object.keys(row)))]`） | 通过 `listAttribute` 解析，纯字符串数组，不校验列是否真的存在于行数据里（缺失列渲染空单元格） |
| `columnLabels` | 列显示名映射 `{列名: 显示名}` | 空对象 `{}` | **只有当值是非数组的 `object` 类型时才生效**：`typeof columnLabels === "object" && !Array.isArray(columnLabels)`。由于标签属性解析永远产出字符串（见 §1.1），**用户在 MDX 标签里直接写 `columnLabels="..."` 永远不会生效**（会被判定不是 object，退化为 `{}`）。该属性事实上只能通过程序化调用 `renderMdxLiteRows`/dataset 查询管线注入（dataset-query.mjs 会算出这个对象，见 §4）。**这是 Mosaic 实现时最容易踩的坑之一**。 |
| `complexity` | 强制表格复杂度 | 未设置时按行数/列数/单元格数/最长单元格自动判定（简单/复杂），见 `table-complexity.mjs` | 只接受字符串 `"simple"` 或 `"complex"`，其他值忽略、回退自动判定 |
| `search` / `freezeFirstColumn`（别名 `freeze`）/ `copyCsv`（别名 `copy`）/ `stickyHeader`（别名 `sticky`） | 表格工具栏开关覆盖 | 由复杂度自动判定的默认值（复杂表格默认开启搜索/复制，行数>100 才默认搜索，列数≥6 才默认冻结列） | `booleanOverride`：接受布尔值，或字符串 `"true"/"1"/"yes"/"on"` → `true`，`"false"/"0"/"no"/"off"` → `false`，其余回退默认值 |
| `dataset` | 外部 `.dataset.json` manifest 相对路径，存在即切换到 dataset 模式（见 §4） | 无 | 非空字符串；`.trim()` 后为空则报错 `"dataset must point to a .dataset.json manifest."` |
| `granularity` | dataset 模式下默认时间粒度 | `"auto"` | 非 `auto` 时必须属于 `granularityOptions` 展开后的集合，否则报错 `"granularity must be included in granularityOptions."`（这是渲染层的浅校验；`dataset-query.mjs` 内还有一层基于真实 manifest 的深校验，见 §4） |
| `granularityOptions` | dataset 模式下允许的时间粒度集合，逗号分隔 | `"day,week,month,quarter"`（= `DATASET_GRANULARITIES.join(",")`） | 每项须 ∈ `{day, week, month, quarter}`（大小写不敏感），否则报错 `"granularityOptions supports day, week, month, and quarter."` |
| `from` / `to` | dataset 模式下的日期范围（也可被 body 的 `query` 块的 `from`/`to` 覆盖，query 优先） | 无 | 见 §4（`dataset-query.mjs` 内的 ISO 日期校验） |

**渲染无关但会被"透传"的属性**：任何未被识别的属性（例如用户自定义的）都会被静默忽略——渲染函数只取自己认识的键，不做"未知属性"报错。

### 2.3 Payload schema

```
```csv
name,value,status
研发,10,ok
市场,5,watch
```
```

或

```json
[{"name":"研发","value":10,"status":"ok"}]
```

或裸 Markdown 表格：

```
| name | value |
| --- | --- |
| 研发 | 10 |
```

- 每行是一个扁平对象，字段名 = 列头（CSV/TSV/Markdown 表）或 JSON key。**没有固定字段名要求**——DataTable 不像 Timeline/MetricGrid 那样对字段名做别名归一化，列就是原始 key（除非 `columns` 属性重排/裁剪）。
- 单元格值经过 `parseCell` 数字嗅探（见 §1.4），渲染时用 `row[column] ?? ""` 取值，`escapeHtml` 转义后放入 `<td>`。
- 空数据（`rows.length === 0`）或空列集合（`columns.length === 0`，即所有行都是空对象）时报错：
  ```
  DataTable requires CSV, JSON, or a Markdown table.
  ```

**最小示例**（伪造数据）：

```
<DataTable title="示例明细" columns="item,amount,note">
```csv
item,amount,note
sample-a,10,ok
sample-b,5,watch
```
</DataTable>
```

### 2.4 输出结构（渲染，非解析核心，但影响可视化对等）

`renderDataTableRows` 输出：`<div class="mdx-component mdx-data-table" data-mdx-component="DataTable"><div class="table-card ..." data-table-complexity="...">` + 工具栏（可选搜索框/冻结列开关/复制 CSV 按钮）+ `<div class="table-scroll" data-table-layout="...">` 包裹 `<table>`（含 `<colgroup>` 按列类型算出的宽度、可选 `<caption>`、`<thead>`、`<tbody>`）。列宽/布局算法在 `table-layout.mjs`（根据列内容判定 `number/date/token/text/detail/longText/hardToken` 七种"列类型"再算宽度）——这部分是纯展示层计算，Mosaic 如果只需要基础表格渲染可以不移植，但如果要 1:1 复刻"自动列宽/简单-复杂表格判定/工具栏显隐"这套体验，`table-complexity.mjs` + `table-layout.mjs` 需要整体移植（两者都是纯函数，零 DOM 依赖）。

---

## 3. Timeline

### 3.1 标签形式

- 只支持**成对标签**（`renderTimeline` 直接取 `token.content`，没有 self-closing 特殊处理；dataset 模式不支持，因为 `DATASET_COMPONENT_NAMES` 不含 Timeline）。
- Payload 走通用 `extractRows`：fenced ```json / ```csv / ```tsv，或裸 JSON 数组 / 竖线 Markdown 表 / 裸 CSV。

### 3.2 属性

| 属性 | 语义 |
|---|---|
| `title` | 渲染为 `<h3 class="mdx-component-title">`，无则不渲染 |

Timeline **没有其他属性**（源码里只读取 `attributes.title`）。

### 3.3 Payload schema

每行代表一个时间线节点，字段别名归一化（`renderTimelineItem`，`mdx-lite.mjs:301-318`）：

| 输出字段 | 取值优先级（`??` 链） |
|---|---|
| `status` | `row.status`（经 `normalizeStatus` 归一化） |
| `date` | `row.date ?? row.time ?? row.month` |
| `title` | `row.title ?? row.name ?? row.event` |
| `body` | `row.body ?? row.description ?? row.summary ?? row.note` |
| `owner` | `row.owner ?? row.assignee` |

`normalizeStatus(value)`（`mdx-lite.mjs:1352-1358`）：

```js
function normalizeStatus(value) {
  const status = String(value || "default").trim().toLowerCase();
  if (["done", "complete", "completed", "success"].includes(status)) return "done";
  if (["blocked", "risk", "warning"].includes(status)) return "blocked";
  if (["active", "doing", "progress", "in-progress"].includes(status)) return "active";
  return "default";
}
```

即状态归一到四个桶：`done` / `blocked` / `active` / `default`（未识别的字符串一律落到 `default`，不报错）。渲染为 `<li class="mdx-timeline-item is-${status}">`。

**没有必填字段的运行时校验**——即使一行 `date`/`title`/`body`/`owner` 全为空，也只是渲染出空的 `<li>`（各字段用 `field ? ... : ""` 三元判断是否渲染对应子元素）。

**空数据报错**（`rows.length === 0`）：

```
Timeline requires CSV or JSON rows.
```

注意错误文案只提 "CSV or JSON"，未提及裸 Markdown 表格路径（虽然实现上确实支持，因为走的是共享 `extractRows`）。

**最小示例**（伪造数据）：

```
<Timeline title="示例进展">
```json
[
  {"date":"2026-01-01","title":"启动","body":"完成立项","status":"done"},
  {"date":"2026-01-08","title":"评审","body":"存在风险点","status":"blocked"}
]
```
</Timeline>
```

---

## 4. DecisionBox

### 4.1 标签形式

- 成对标签。Payload 走通用 `extractRows`，但 DecisionBox **允许空 rows**——它不像 DataTable/MetricGrid/Timeline 那样在空 rows 时报错，而是回退到"富文本"渲染路径。

### 4.2 属性

| 属性 | 语义 | 归一化 |
|---|---|---|
| `title` | 渲染为 `<h3 class="mdx-component-title">` | 无 |
| `status`（别名 `decisionStatus`，取值优先级 `attributes.status \|\| attributes.decisionStatus`） | 决策状态徽章 | 见下 `normalizeDecisionStatus` |
| `owner` | 责任人徽章 | 直接透传、escapeHtml |
| `source` | 来源徽章 | 直接透传、escapeHtml |

`normalizeDecisionStatus(value)`（`mdx-lite.mjs:1360-1365`）：

```js
function normalizeDecisionStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["accepted", "proposed", "rejected", "superseded"].includes(status)) return status;
  if (["done", "complete", "completed"].includes(status)) return "accepted";
  return status ? "default" : "";
}
```

即：四个规范值原样透传；`done`/`complete`/`completed` 归一为 `accepted`；其他非空字符串归一为 `"default"`；空/未设置则返回 `""`（此时不渲染状态徽章，且外层 `<section>` 的 CSS 类退化为 `is-default`：`class="mdx-component mdx-decision-box is-${status || "default"}"`）。

固定文案：区块头部左上角有一个不可配置的 kicker 标签，英文 `"Decision"`、中文 `"决策"`（i18n key `decision.kicker`）。

### 4.3 Payload schema —— 两条互斥路径

**路径 A：结构化 label/value 行**（当 `extractRows` 解析出 ≥1 条含 label 或 value 的行时启用）：

```js
const items = rows.map((row) => ({
  label: row.label ?? row.key ?? row.name ?? row.item ?? "",
  value: row.value ?? row.text ?? row.body ?? row.description ?? row.summary ?? "",
})).filter((item) => item.label || item.value);
```

渲染为 `<dl class="mdx-decision-list">`，每项 `<dt>label</dt><dd>value</dd>`（`value` 经 `renderInlineText` 处理：支持行内 `` `code` `` 和 `**bold**` 两种极简 markdown，其余转义）。

**路径 B：富文本正文回退**（当路径 A 的 `items.length === 0`，即没有可用的 label/value 行）：

```js
items.length > 0
  ? `<dl class="mdx-decision-list">${items.map(renderDecisionItem).join("")}</dl>`
  : `<div class="mdx-decision-body">${renderRichBlock(content)}</div>`
```

`renderRichBlock(content)` 先用 `stripTextFence` 剥离围栏（仅当围栏语言标签 ∈ `["md","markdown","text","txt"]` 时取 fence body，否则原样用整个 `content`），然后做极简段落/无序列表解析：按空行分段，`- ` 或 `* ` 开头的行归入 `<ul><li>`，其余连续非空行拼成一个 `<p>`（用空格 join）。**不支持有序列表、标题、引用块、嵌套列表**。

**没有硬性"必须有数据"的报错**——DecisionBox 是五类中唯一一个空 payload 也不报错的组件（`renderRichBlock("")` 返回空字符串，`<div class="mdx-decision-body"></div>`）。

**最小示例**（伪造数据）：

```
<DecisionBox title="示例决策" status="accepted" owner="alice">
```csv
label,value
决策,采用方案 A
代价,迁移成本约两周
```
</DecisionBox>
```

或无结构化数据的自由文本形式：

```
<DecisionBox title="示例决策">
我们选择方案 A。

- 优点：实现简单
- 缺点：扩展性一般
</DecisionBox>
```

---

## 5. MetricGrid

### 5.1 标签形式

成对标签，payload 走通用 `extractRows`（fenced csv/json/tsv 或裸 JSON/Markdown表/CSV）。

### 5.2 属性

只有 `title`（`<h3 class="mdx-component-title">`）。**没有其他属性**。

### 5.3 Payload schema

字段别名归一化（`renderMetricGrid`，`mdx-lite.mjs:365-371`）：

| 输出字段 | 取值优先级 |
|---|---|
| `label` | `row.label ?? row.metric ?? row.name ?? row.title` |
| `value` | `row.value ?? row.current ?? row.amount ?? row.count` |
| `delta` | `row.delta ?? row.change ?? row.mom ?? row.yoy` |
| `note` | `row.note ?? row.description ?? row.source ?? row.body` |
| `status` | `normalizeMetricStatus(row.status ?? row.trend ?? row.delta ?? row.change)` |

行过滤：`items.filter((item) => item.label || item.value)`（label 和 value 都为空的行被丢弃，不算入渲染）。

`normalizeMetricStatus(value)`（`mdx-lite.mjs:1367-1375`）：

```js
function normalizeMetricStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["good", "up", "positive", "success", "active"].includes(status)) return "good";
  if (["risk", "warning", "blocked", "down", "negative"].includes(status)) return "risk";
  if (["watch", "flat", "neutral"].includes(status)) return "watch";
  if (/^\+/.test(status)) return "good";
  if (/^-/.test(status)) return "risk";
  return "neutral";
}
```

三个显式桶（`good`/`risk`/`watch`）+ 两条正则兜底规则（值以 `+` 开头 → `good`，以 `-` 开头 → `risk`，这允许直接把 `delta` 列如 `"+3%"` 喂给 `status ?? ... ?? delta` 链自动判定颜色）+ 默认 `neutral`。渲染为 `<article class="mdx-metric-item is-${status}">`。

**空数据报错**：

```
MetricGrid requires CSV, JSON, or a Markdown table.
```

（与 DataTable 完全相同的错误文案，但触发条件只看 `rows.length === 0`，不看列集合。）

**最小示例**（伪造数据）：

```
<MetricGrid title="示例指标">
```csv
label,value,delta,note,status
月活,1.2万,+5%,同比增长,good
留存率,42%,-3%,需关注,watch
```
</MetricGrid>
```

---

## 6. FlowDiagram

### 6.1 标签形式

成对标签。Payload 有**两种互斥输入形态**，由 `extractFlowDiagram(content)` 依次尝试：

```js
function extractFlowDiagram(content) {
  const parsed = parseJsonValue(content);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.nodes)) {
    return normalizeFlowDiagram(parsed.nodes, parsed.edges || parsed.links || []);
  }
  const rows = extractRows(content);   // 回退：表格式行数据
  const nodes = rows.map((row, index) => ({
    id: String(row.id ?? row.key ?? index + 1),
    label: String(row.label ?? row.title ?? row.name ?? row.id ?? index + 1),
    type: normalizeFlowType(row.type ?? row.kind ?? row.status),
    note: row.note ?? row.description ?? "",
    next: row.next ?? row.to ?? "",
  }));
  const edges = nodes.flatMap((node) => listAttribute(node.next).map((target) => ({ from: node.id, to: target, label: "" })));
  return normalizeFlowDiagram(nodes, edges);
}
```

**形态 A（graph JSON）**：`content` 必须是**唯一**一个 fenced 代码块且语言标签恰为 `json`（`parseJsonValue` 内部：若有 fence 但 `format !== "json"` 直接返回 `null`，不会退化到形态 B 的行解析——即写 ```csv 且内容恰好是合法 JSON 也不会被当图解析），或裸文本本身以 `{`/`[` 开头；解析出的顶层值必须是**非数组对象**且含 `Array.isArray(parsed.nodes)`，否则整体判定"不是形态 A"，转入形态 B。

形态 A 顶层结构：

```json
{
  "nodes": [ { "id": "...", "label": "...", "type": "...", "note": "...", "next": "..." } ],
  "edges": [ { "from": "...", "to": "...", "label": "..." } ]
}
```

`edges` 字段名可以是 `edges` 或 `links`（`parsed.edges || parsed.links || []`，`edges` 优先）。

**形态 B（表格式行，回退）**：走通用 `extractRows`（CSV/TSV/JSON数组/裸Markdown表都可），每行映射为一个节点，节点的 `next`（或 `to`）字段（逗号分隔，经 `listAttribute` 拆分）**隐式生成边**——即用 DataTable 一样的表格写一列 `next` 就能画出流程图，不需要单独的 edges 表。

两种形态**最终都汇入同一个归一化函数** `normalizeFlowDiagram(rawNodes, rawEdges)`（`mdx-lite.mjs:994-1018`）：

```js
const nodes = rawNodes.map((node, index) => {
  const id = String(node.id ?? node.key ?? index + 1).trim();
  return {
    id,
    label: String(node.label ?? node.title ?? node.name ?? id).trim(),
    type: normalizeFlowType(node.type ?? node.kind ?? node.status),
    note: String(node.note ?? node.description ?? "").trim(),
    next: node.next ?? node.to ?? "",
  };
}).filter((node) => node.id);   // id 为空字符串的节点被丢弃

const ids = new Set(nodes.map((node) => node.id));
const edges = [
  ...rawEdges.map((edge) => ({
    from: String(edge.from ?? edge.source ?? "").trim(),
    to: String(edge.to ?? edge.target ?? "").trim(),
    label: String(edge.label ?? edge.title ?? "").trim(),
  })),
  ...nodes.flatMap((node) => listAttribute(node.next).map((target) => ({ from: node.id, to: target, label: "" }))),
].filter((edge) => ids.has(edge.from) && ids.has(edge.to));   // 悬空边（指向不存在节点）被静默丢弃
```

即：即使走了形态 A（显式 JSON graph），节点上的 `next`/`to` 字段依然会**再次**被拿去生成隐式边并追加到显式 `edges` 数组后面（两者合并，不去重）；同时显式 `edges` 支持 `from`/`source`、`to`/`target`、`label`/`title` 三组别名。所有引用不存在节点 id 的边（无论是显式给的还是 next 派生的）都被静默过滤掉，不报错。

`normalizeFlowType(value)`（`mdx-lite.mjs:1377-1383`）：

```js
function normalizeFlowType(value) {
  const type = String(value || "action").trim().toLowerCase();
  if (["start", "end", "decision", "gate", "risk", "action"].includes(type)) return type;
  if (["warning", "blocked", "error"].includes(type)) return "risk";
  if (["question", "branch", "condition"].includes(type)) return "decision";
  return "action";
}
```

六个规范类型：`start`/`end`/`decision`/`gate`/`risk`/`action`（默认）；三个同义词组归一（`warning/blocked/error → risk`，`question/branch/condition → decision`）；其余未识别一律 `action`。渲染为 `<g class="mdx-flow-node is-${node.type}">`。

### 6.2 属性

| 属性 | 语义 |
|---|---|
| `title` | `<figcaption>`，同时若存在会作为 SVG 的 `aria-label`（否则 aria-label 用 i18n `flow.ariaLabel`：英文 `"Flow diagram"`，中文 `"流程图"`） |
| `note` | 图下方 `<p class="mdx-flow-note">` 附注文字 |

### 6.3 空数据报错

```
FlowDiagram requires nodes.
```

（`model.nodes.length === 0` 时触发，即使 edges 有内容也不够——必须至少有一个 id 非空的节点。）

### 6.4 自动布局（渲染层，非解析核心）

`layoutFlowDiagram` 用 Kahn 拓扑排序（`computeFlowLevels`）把节点分层（沿 `edges` 的 `from→to` 方向按最长路径分层，孤立/环上节点兜底放到最大层之后），再按层横向等距排布、纵向按层递增，生成静态 SVG（贝塞尔曲线连边 + 箭头 marker + 自动换行的节点文字 `wrapFlowText`，按字符宽度估算换行，中日韩字符按宽字符计）。这部分是纯几何计算函数（`computeFlowLevels`/`layoutFlowDiagram`/`wrapFlowText`/`renderFlowEdge`/`renderFlowNode`），零外部依赖，如果 Mosaic 想要"数据驱动自动布局"的等价体验，建议整体移植；如果 Mosaic 打算换用别的图渲染方案（如 Obsidian 内置的 Mermaid/Canvas），则只需要移植到 `normalizeFlowDiagram` 为止的**解析结果**（`{nodes, edges}`），布局算法可重写。

**最小示例（形态 A，伪造数据）**：

```
<FlowDiagram title="示例流程">
```json
{
  "nodes": [
    {"id": "a", "label": "开始", "type": "start"},
    {"id": "b", "label": "判断条件", "type": "decision"},
    {"id": "c", "label": "结束", "type": "end"}
  ],
  "edges": [
    {"from": "a", "to": "b"},
    {"from": "b", "to": "c", "label": "满足"}
  ]
}
```
</FlowDiagram>
```

**最小示例（形态 B，表格式，伪造数据）**：

```
<FlowDiagram title="示例流程">
```csv
id,label,type,next
a,开始,start,b
b,判断条件,decision,c
c,结束,end,
```
</FlowDiagram>
```

---

## 7. Dataset 模式与 `dataset-query.mjs`（DataTable 专属深挖）

### 7.1 两阶段渲染架构（重要：Mosaic 需要合并成单阶段）

早期内部实现 是"本地 Web 服务 + 浏览器前端"架构，dataset 模式因此被拆成两个阶段：

1. **渲染阶段**（`renderDatasetView`，`mdx-lite.mjs:174-219`，纯字符串生成，不读取任何数据文件）：只解析标签属性和 body 里的 ```query fence，把请求信息编码成一个 `data-dataset-request` 属性（`encodeURIComponent(JSON.stringify({component, dataset, attributes, query, granularityOptions}))`），输出一个占位 `<section data-mdx-dataset-view="true">...</section>`，附带粒度切换按钮（hidden，等 JS 激活）和 "Loading dataset…" 占位文案。
2. **查询阶段**（`src/server/index.mjs:1289-1314` 的 `datasetQueryPayload`，由浏览器端 `public/dataset-view.js` 发起 HTTP 请求触发）：服务器用 `dataset-loader.mjs` 的 `loadDataset()` 读取并校验 `.dataset.json` manifest + 数据文件，调用 `queryDataset()` 算出 `{rows, attributes, meta}`，再用 `renderMdxLiteRows(component, rows, attributes, {locale})` 把结果**再走一遍**该组件的行渲染函数（`renderDataTableRows`/`renderChartRows`），生成最终 HTML 替换占位符。

**对 Mosaic 的启示**：Obsidian 插件没有"服务器"这一层，`renderDatasetView` 和 `datasetQueryPayload` 这两步应该在插件里合并成**同步（或 Promise 化的单次）调用**：解析标签 → 读取 vault 内的 manifest 文件 → 调用与 `queryDataset` 等价的查询函数 → 直接调用与 `renderDataTableRows` 等价的渲染函数，一次性产出最终 DOM，不需要中间的 "loading 占位 + 二次请求" 状态机（除非 Mosaic 想保留渐进式渲染体验）。`dataset-loader.mjs` 里的**文件系统路径解析/大小限制/服务器缓存**（`resolveDatasetReference`/`MANIFEST_MAX_BYTES`/`datasetCache`）是服务器专属考量，Mosaic 应重新设计（Obsidian vault 内路径解析规则不同），但 **manifest 内容校验规则**（下方 7.2）是纯业务逻辑，值得移植。

### 7.2 `.dataset.json` manifest 结构（`dataset-loader.mjs::validateManifest`，DataTable 的 dataset 模式依赖它）

顶层允许键：`schemaVersion`（必须 `=== 1`）、`id`、`title`、`description`、`data`（数据文件相对路径）、`format`（`csv`/`tsv`/`json`，缺省从 `data` 扩展名推断）、`grain`、`primaryKey`、`time`、`fields`、`skipBlankRows`。

`fields[]` 每项：`name`（唯一、不含逗号/控制字符、不能是保留字 `"period"`）、`type` ∈ `{string, integer, decimal, number, boolean, date}`、`required`、`label`、`description`、`unit`、`rollup`、`sourceColumn`（1-based 列号，用于源列与字段名不一致时的映射，CSV/TSV only）、`numberFormat`（当前只支持 `"comma-grouped"`，即 `"1,234.5"` 这种千分位格式）。

`rollup` 三种写法：
- 字符串简写：`"sum" | "avg" | "min" | "max" | "count" | "first" | "last"`（`sum/avg/min/max` 要求数值类型字段）。
- 对象写法（仅 `ratioOfSums`）：`{ "op": "ratioOfSums", "numerator": "字段名", "denominator": "字段名", "scale": 100 }`，`numerator`/`denominator` 必须引用已定义的数值字段，`scale` 缺省 1。
- `null`/未设置：无 rollup，只能在"目标粒度 = 源粒度且该桶恰好 1 行"时直接透传原始值，否则查询阶段报错（见 7.3）。

`time` 对象：`field`（必须是已定义的 `date` 类型字段）、`weekStartsOn`（`monday`|`sunday`，默认 `monday`）、`calendar`（`calendar`|`weekdays`，默认 `calendar`）、`sourceGranularity`（必须 ∈ `{day,week,month,quarter}`，无默认值，必填）。

`grain`/`primaryKey` 都必须是已定义字段名数组、都必须包含 `time.field`；`primaryKey` 里的每个字段必须 `required: true`。

### 7.3 `queryDataset()` 语义（`dataset-query.mjs`，DataTable 的 `{component: "DataTable"}` 分支）

**入参**：`{ manifest, rows, component, attributes, query, granularity, granularityOptions }`。

**`query` 对象合法键**：仅 `from`、`to`、`where`，出现其他键报错 `Unsupported dataset query key: ${key}.`。

**粒度协商三层过滤**：
1. `granularityOptions`（属性层，逗号列表，默认全部四档）经 `normalizeGranularityOptions` 去重/小写/校验。
2. 与源数据 `sourceGranularity` 做"安全粗化"交集（`SAFE_VIEW_GRANULARITIES`）：`day` 源可安全粗化到全部四档；`week` 源只能到 `week/month/quarter`（不能反推出 day）；`month` 源只能到 `month/quarter`；`quarter` 源只能保持 `quarter`。交集为空报错 `${sourceGranularity} 源数据不支持该 granularityOptions 覆盖的任何视图`。
3. **仅 Chart 组件**额外做"可读性"过滤：统计每个候选粒度下会产生多少个时间桶（`bucketCount`），超过 `MAX_READABLE_CHART_PERIODS = 120` 的粒度被剔除进 `densityLimitedGranularities`（图表点太密不可读）；**DataTable 不受此限制**，所有安全粗化粒度都保留在 `availableGranularities`（这是测试 `long-running data tables keep explicitly requested daily rows` 明确验证的行为差异）。

**列/字段选择**（`componentFields`，DataTable 分支）：

```js
if (component === "DataTable") {
  const configured = listAttribute(attributes.columns);
  if (configured.length > 0) return uniqueStrings(configured);
  return [manifest.time.field, ...manifest.fields.filter(f => f.name !== manifest.time.field && f.rollup).map(f => f.name)];
}
```

即：显式 `columns` 属性优先；否则默认列 = 时间字段 + **所有设置了 rollup 的非时间字段**（没有 rollup 的维度字段，如 `company_id`、`note`，默认不会出现在表格里，必须显式写进 `columns` 才会被选中——选中后如果目标粒度不是源粒度会触发 7.4 的"needs a rollup"报错）。

**日期范围**：`query.from ?? attributes.from`（query 优先于属性），必须是合法 ISO 日期 `YYYY-MM-DD`（`isIsoDate`，用往返 UTC 转换校验，拒绝像 `2026-02-30` 这种"看起来合法实际不存在"的日期），否则报错 `Dataset query ${name} must be YYYY-MM-DD.`；`from > to` 报错 `"Dataset query from must not be after to."`；且 `from`/`to` 各自必须是**源粒度的周期起点**（例如源粒度是 `week` 时，`from` 必须恰好落在一个周起始日上），否则报错 `Dataset query ${name} must identify a ${sourceGranularity} source period start.`。

**where 过滤器**：数组，最多 10 条，每条只允许 `field`/`op`/`value` 三键；`op` ∈ `{eq, notEq, in, notIn}`（默认 `eq`）；`in`/`notIn` 的 `value` 必须是长度 1-100 的数组；值按 `field.type` 强制转型（`integer/decimal/number` → Number 且 integer 类型还要求 `Number.isInteger`；`boolean` → true/false 或 `"true"/"false"` 字符串；`date` → 必须 ISO 日期；`string` → 原样转字符串），任一转型失败报错 `Filter value for "${name}" must be ${type}.` / `... must be boolean.` / `... must be YYYY-MM-DD.`。过滤用 `Object.is` 精确匹配（含 `NaN`/`-0` 语义），`notEq`/`notIn` 取反。

**行范围过滤**（`from`/`to`/`where` 全部应用后）：结果为空报错 `"Dataset query returned no rows."`。

**排序**：按 `[timeField, ...primaryKey]` 用 `localeCompare(..., "en", {numeric:true})` 逐字段比较升序排序。

**总跨度上限**：`effectiveFrom`~`effectiveTo` 跨度 `+1` 天数超过 `MAX_RANGE_DAYS = 10000` 天报错 `Dataset query range must not exceed 10000 days.`。

**分桶（bucketing）**：按 `selectedGranularity` 把排序后的行分组，桶 key 由 `bucketStart()` 计算——特别规则：当**源粒度是 week 且目标粒度是 month/quarter** 时，先把每条周记录的日期 `+3天`（取该周的"第四天"）再截断到月/季度起点，这样一整周会被完整分配给它"多数天数所在"的那个自然月/季度，而不是简单按周起始日归属。桶数超过 `MAX_OUTPUT_ROWS = 5000` 报错 `Dataset query produces ${size} rows; narrow the time range below 5000.`。

**覆盖度与缺失周期**：`missingPeriods` = 源粒度下 `effectiveFrom`~`effectiveTo` 范围内应存在的所有周期起点，减去实际观测到的；`periodCoverage()` 对每个输出桶计算 `boundaryPartial`（该桶的自然区间越出了实际数据覆盖范围的边界）和 `partial`（`boundaryPartial` 或桶内缺了源周期）。

**边界桶省略规则**（仅当**源粒度是 week 且目标粒度是 month 或 quarter**时生效）：`boundaryPartial` 的桶会被整体从输出中剔除（`omittedBoundaryPeriods` 记录被剔除的周期标签），因为半个月/半个季度的数据汇总没有意义；若剔除后一个桶都不剩，报错 `Dataset query has no complete ${granularity} periods after omitting incomplete boundary periods.`。其余"部分缺失但不在边界"的桶（`partial` 但非 `boundaryPartial`）**照常输出**，只在 `meta.partialPeriods` 里警示。

**字段聚合**（`aggregateField`）——DataTable 每个输出列都要过一遍：
- 无 `rollup`：只有 `granularity === sourceGranularity && bucket 恰好 1 行` 才允许直接透传该行原值，否则报错 `Field "${name}" needs a rollup before it can be shown in ${granularity} view.`
- `ratioOfSums`：`sum(numerator)/sum(denominator)*scale`，分母和为 0 时返回 `null`（不报错）。
- `count`：非 null/undefined 值的个数。
- `first`/`last`：要求桶内每行 `timeField` 唯一（否则报错 `Field "${name}" uses ${op}, but multiple rows share a date; filter the dataset to one series before aggregating.`），取第一个/最后一个非空值。
- `sum`/`avg`/`min`/`max`：要求所有非空值都是有限数字，否则报错 `Field "${name}" contains non-numeric values for ${op}.`；无非空值时返回 `null`。
- 未知 `rollup.op` 报错 `Unsupported rollup for field "${name}": ${op}.`

**输出（`queryDataset` 返回值）**：

```ts
{
  rows: Array<{ [timeFieldOrPeriod]: string, ...outputFields }>,  // 每行 timeField(或若列表含"period"则该键) 被替换为周期标签字符串（如 "2026-Q1"/"2026-01"/原始日期），其余列 = 聚合值
  attributes: {
    ...原 attributes,
    // DataTable 专属：
    columns: outputFields.join(","),
    columnLabels: { [fieldName]: field.label || fieldName },   // ← columnLabels 对象在此处首次真正产生
  },
  meta: {
    datasetId, datasetTitle, sourceGranularity,
    availableGranularities, densityLimitedGranularities,
    granularity,               // 实际选中的粒度
    from, to,                  // effectiveFrom/effectiveTo
    dataThrough,                // 最新一行的 timeField
    sourceRows, totalRows, outputRows,
    missingPeriodCount, missingPeriods,   // 截断到前 20 条；missingDateCount/missingDates 是同值的兼容别名
    partialPeriodCount, partialPeriods,   // 截断到前 20 条
    omittedBoundaryPeriodCount, omittedBoundaryPeriods,  // 截断到前 20 条
  },
}
```

`periodLabel(period, granularity)`：`day` → 原样 `YYYY-MM-DD`；`month` → `YYYY-MM`（截取前 7 位）；`quarter` → `YYYY-QN`（`N = floor((月份-1)/3)+1`）。

### 7.4 "inline payload 是否也支持"的明确答案

**不支持。** 一旦 DataTable 打上 `dataset` 属性，组件体（body）**唯一合法内容**是一个 fenced ```query 代码块，内容必须是 JSON 对象且只能含 `from`/`to`/`where` 键（`datasetQueryFromContent`，`mdx-lite.mjs:221-239`）：

```js
function datasetQueryFromContent(content) {
  if (!String(content ?? "").trim()) return {};        // 空 body（含 self-closing）等价于空查询
  const dataBlock = extractDataBlock(content);
  if (!dataBlock || dataBlock.format !== "query") {
    throw new Error("A dataset component body may contain only a fenced query JSON object.");
  }
  let query;
  try { query = JSON.parse(dataBlock.body); }
  catch { throw new Error("Dataset query must contain valid JSON."); }
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw new Error("Dataset query must be a JSON object.");
  }
  return query;
}
```

测试 `renderMarkdown accepts only a fenced finite query inside a dataset component` 直接验证：给一个 `dataset` DataTable 塞 ```csv 内联数据会报错，错误信息含 `"fenced query JSON object"`。也就是说 **dataset 模式与内联 payload 模式是完全互斥的**：一旦有 `dataset` 属性，行数据 100% 来自外部 manifest+数据文件，body 只用来传一个可选的过滤条件（`from`/`to`/`where`），不能补充或覆盖行内容。

**Dataset 模式最小示例**（伪造数据，两种写法）：

```
<DataTable dataset="./data/demo.dataset.json" columns="date,revenue" granularity="month" />
```

```
<DataTable dataset="./data/demo.dataset.json" columns="date,revenue" from="2026-01-01" to="2026-03-31">
```query
{"where":[{"field":"company_id","op":"eq","value":"001"}]}
```
</DataTable>
```

---

## 8. 移植 vs 重新实现 建议清单

### 建议逐字节移植（纯函数、零/极浅外部依赖，逻辑必须与 早期内部实现 位级一致才能保证同一份 `.md` 在两边渲染结果一致）

| 函数/模块 | 来源文件 | 备注 |
|---|---|---|
| `mdxLiteComponentOpeningAtLines` / `mdxLiteComponentBlockAtLines` / `parseMdxLiteAttributes` / `unquotedTagEnd` | `mdx-lite-syntax.mjs` | 整个文件 117 行，零依赖，标签边界探测的唯一真源 |
| `parseDelimitedRecords` | `delimited-data.mjs` | 整个文件，零依赖，CSV/TSV 状态机 |
| `extractDataBlock` / `extractRows` / `rowsFromJson` / `rowsFromDelimited` / `rowsFromMarkdownTable` / `parseCell` / `listAttribute` / `uniqueStrings` | `mdx-lite.mjs`（当前模块私有，需重新导出或复制） | 五类组件（+ Chart）payload 提取的共同真源 |
| `normalizeStatus`（Timeline）/ `normalizeDecisionStatus`（DecisionBox）/ `normalizeMetricStatus`（MetricGrid）/ `normalizeFlowType`（FlowDiagram） | `mdx-lite.mjs` | 状态归一化查表，逻辑简单但错一个词就会导致视觉不一致 |
| `normalizeFlowDiagram` / `extractFlowDiagram` | `mdx-lite.mjs` | FlowDiagram 双形态解析 + 边过滤逻辑 |
| `isDatasetGranularity` / `datasetGranularitiesForSource` / `isDatasetPeriodStart` / `datasetPeriodStartsBetween`（dataset 模式需要时） | `dataset-granularity.mjs` | 整个文件，零依赖，纯日期计算 |
| `queryDataset` 及其内部所有辅助函数（dataset 模式需要时） | `dataset-query.mjs` | 整个文件 620 行都是纯函数（无 fs/网络依赖），是 DataTable dataset 查询语义的唯一真源；已在 早期内部实现 中作为独立模块存在，符合任务描述"像 dataset-query 已经被移植过"的先例 |

### 建议重新实现（依赖 Node.js `fs`/HTTP、或与 Obsidian vault API 强相关，逻辑需要但载体要换）

| 关注点 | 早期内部实现 实现 | Mosaic 应做的调整 |
|---|---|---|
| `.dataset.json` manifest 加载与路径解析 | `dataset-loader.mjs::loadDataset` + `resolveDatasetReference`（Node `fs`/`path`，仓库根目录越权校验） | 改为 Obsidian `Vault.read`/`TFile` API 读取，vault 内相对路径解析规则要单独设计；**manifest 内容校验规则**（§7.2 表格）建议保留同一套字段/类型/rollup 校验逻辑 |
| dataset 查询的两阶段（占位 HTML → 二次 HTTP 请求 → 替换）架构 | `renderDatasetView` + `public/dataset-view.js` + `src/server/index.mjs::datasetQueryPayload` | 合并为单阶段：解析标签 → 读 vault 文件 → 调 `queryDataset` 等价函数 → 直接渲染最终 DOM，除非 Mosaic 想保留"加载中"占位体验 |
| markdown-it 块规则注册（`renderer.block.ruler.before("paragraph", ...)`） | `markdown.mjs` | Mosaic 若基于 Obsidian 的 Markdown post-processor（`registerMarkdownPostProcessor`）或自定义 CodeMirror 插件，需要用等价机制重新对接标签探测结果，但探测逻辑本身（§1.1）照搬 |
| DataTable 渲染态计算：`table-complexity.mjs`（简单/复杂判定、工具栏开关默认值）、`table-layout.mjs`（列类型识别、自动列宽） | 两个纯函数文件，零依赖 | 逻辑可整体移植（无 Node 专属 API），但如果 Mosaic 决定用更简单的表格样式（例如直接吃 Obsidian 原生表格渲染），可以裁剪掉这套复杂度分级逻辑，只保留基础渲染 |
| FlowDiagram 自动布局（`layoutFlowDiagram`/`computeFlowLevels`/`wrapFlowText`/SVG 拼接） | `mdx-lite.mjs` 私有函数，纯几何计算 | 逻辑与技术栈无关，可整体移植；如果 Mosaic 想换用 Obsidian 生态更常见的图渲染方式（如内嵌 Mermaid flowchart），则只需要移植到 `{nodes, edges}` 解析结果为止，布局/绘制部分重写 |
| 各组件的 HTML 字符串拼接（`renderDataTableRows`/`renderTimeline`/`renderDecisionBox`/`renderMetricGrid`/`renderFlowDiagram` 里生成 `<div>`/`<table>`/`<svg>` 标签的部分） | `mdx-lite.mjs` | Obsidian 插件通常用 DOM API（`createEl`）而非字符串拼接构建预览区块；**字段选择/归一化/校验逻辑**要保留，**HTML 生成方式**按 Obsidian 插件惯例重写 |
| 错误呈现（`componentError` + i18n `component.error` 模板） | `mdx-lite.mjs` + `public/i18n.js` | 错误消息原文（各处 `throw new Error(...)` 的字符串）建议保留一致，方便用户从 早期内部实现 文档迁移过来时行为可预期；外层包裹样式/i18n 机制按 Obsidian 插件自身规范重写 |

### 关键"陷阱"清单（供实现前提醒，均已在正文标注）

1. `columnLabels` 作为 DataTable **标签属性**直接写永远不生效（属性解析只产出字符串），它只能通过 dataset 查询管线产出的对象注入。
2. dataset 模式下 DataTable **不允许**内联 CSV/JSON payload，body 只能放一个可选的 ```query fence。
3. `extractDataBlock` 的语言标签只在 `json`/`tsv` 时改变解析路径，其余任何标签（含拼写错误、`text`、`python` 等）一律退化为 CSV。
4. FlowDiagram 的 `next`/`to` 隐式边生成，即使在显式 JSON graph 形态下也会叠加执行一次，不是"表格式独有"。
5. DecisionBox 是五类中唯一"空 payload 不报错"的组件（回退到富文本渲染，可以完全为空）。
6. Timeline 的空数据错误文案只提 "CSV or JSON"，但实际上裸 Markdown 表格也被接受（继承自共享 `extractRows`）——文案与实际能力不完全对齐，Mosaic 决定是否原样保留这个"文案偏差"。
7. DataTable dataset 查询里，**只有 Chart** 受"图表可读密度上限 120 点"限制而剔除粒度选项，DataTable 不受此限制。
8. 源粒度为 `week` 且汇总到 `month`/`quarter` 时有两条特殊规则：（a）用"周的第四天"决定归属月/季度；（b）不完整的边界桶会被整体从输出中剔除（而非仅标记 partial）。
