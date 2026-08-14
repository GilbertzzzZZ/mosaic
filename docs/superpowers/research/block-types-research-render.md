# git-leaf 五类 mdx-lite 组件渲染规格调研

调研目标仓库：`/Users/gilbertzzzzzzzzz/projects/git-leaf`（只读）
调研范围：`DataTable`、`MetricGrid`、`Timeline`、`DecisionBox`、`FlowDiagram` 五类组件的渲染（render）实现，供 Obsidian 插件 Mosaic（React/Preact + 自有 CSS）重新实现时作为视觉/行为规格（spec）参考。

核心源文件：
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/src/content/mdx-lite.mjs`（渲染函数主体，1411 行）
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/src/content/table-complexity.mjs`（DataTable 工具栏与复杂度判定）
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/src/content/table-layout.mjs`（DataTable 列宽自动布局算法）
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/public/styles.css`（组件 CSS，第 4400-5480 行为 mdx 相关样式）
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/public/app.js`（第 9417-9443 行：DataTable 交互 enhanceTables）
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/public/dataset-view.js`（外部 dataset 的 granularity 切换与 meta 渲染）
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/docs/mdx-lite-guide.md`（权威语法文档）
- `/Users/gilbertzzzzzzzzz/projects/git-leaf/docs/mdx-lite-components-demo.mdx`（可视化回归 fixture，含真实样例数据）

---

## 0. 总体架构：渲染管线怎么工作

1. `mdxLiteBlockRule`（`mdx-lite.mjs:53`）是一个 markdown-it block rule：识别 `<ComponentName ...>...</ComponentName>` 语法块（组件名取自白名单 `MDX_LITE_COMPONENT_NAMES` = `DataTable, Timeline, Chart, DecisionBox, MetricGrid, FlowDiagram`），把整块内容（含属性 attributes 与 body content）打包进一个 `mdx_lite_component` token。
2. `renderMdxLiteComponent(token, {locale})`（`mdx-lite.mjs:99`）按 `token.meta.name` 分发到具体渲染函数：`renderDataTable` / `renderTimeline` / `renderChart` / `renderDecisionBox` / `renderMetricGrid` / `renderFlowDiagram`。渲染函数**直接拼接字符串生成静态 HTML/SVG**，不使用任何前端框架或图表库（无 ECharts、无 D3、无 Mermaid runtime）。
3. 组件 body 的数据格式统一由 `extractRows(content)`（`mdx-lite.mjs:1150`）解析：优先识别 fenced code block（` ```csv/tsv/json ``` `），否则退化尝试 JSON / Markdown table / 裸 CSV。CSV/TSV 走 `parseDelimitedRecords`（`delimited-data.mjs`），首行为表头；单元格数字自动转换为 JS number（`parseCell`，正则 `^-?\d+(?:\.\d+)?$`）。
4. `dataset="..."` 属性（DataTable / Chart 独有）触发"外部数据集"模式：不内联数据，而是渲染一个 `mdx-dataset-view` 容器 + 前端 fetch `/api/dataset-query`，异步拿到同一套 `renderDataTableRows`/`renderChartRows` 产出的 HTML 片段插入。**这是运行时行为，不是纯静态渲染**，Mosaic 若要复刻需要自己的数据源桥接层；本文档以行内数据（inline body）路径为主要规格来源。
5. 统一的国际化：`createTranslator(MDX_MESSAGES, locale)`（来自 `public/i18n.js`），支持 `en` / `zh-CN`。
6. 统一错误处理：任何渲染函数抛出异常都会被 `renderMdxLiteComponent` 的 try/catch 捕获，落到 `componentError(name, error, translate)`（`mdx-lite.mjs:1385`），产出统一的错误 DOM（见各组件"空/错误状态"小节）。
7. 所有文本值一律经过 `escapeHtml`（`mdx-lite.mjs:1405`，转义 `& < > "`）。**没有任何组件对数值做货币/百分号/千分位等展示层格式化** —— DataTable 单元格、Timeline、DecisionBox、MetricGrid 全部是"原样字符串"直出；唯一做数字格式化的是 Chart（不在本次范围）。这一点对 Mosaic 很重要：**不要在渲染层臆造 numberFormat 逻辑，数据源本身已经是最终展示字符串**（除非未来接入 dataset-loader 的 `numberFormat: "comma-grouped"`，那是"解析输入"，不是"渲染输出"格式化）。

CSS 设计令牌（`public/styles.css` `:root` 与 `:root[data-theme="dark"]`）：全部组件颜色引用 CSS 变量，无一处硬编码 hex（FlowDiagram 节点状态色例外，见 §5）。核心变量：

| 变量 | light | dark | 用途 |
| --- | --- | --- | --- |
| `--panel` | `#ffffff` | `#191a1d` | 卡片背景 |
| `--panel-muted` | `#fbfcfe` | `#151619` | 次级背景（如 metric item 背景） |
| `--panel-weak` | `#f8fafc` | `#202126` | badge 背景 |
| `--panel-border` | `#d9dee7` | `#4a4d55` | 边框/分隔线 |
| `--text` | `#17202e` | `#f2f1ec` | 主文字 |
| `--text-secondary` | `#344054` | `#d5d0c8` | 次文字 |
| `--muted` | `#667085` | `#aaa59c` | 弱化文字（label、meta） |
| `--muted-soft` | `#98a2b3` | `#958f86` | 更弱（timeline 默认圆点边框） |
| `--accent` | `#2563eb` | `#7aa2f7` | 强调色（active 态、gate 节点） |
| `--accent-soft` | `#eaf1ff` | `#24304a` | 强调色浅底 |
| `--danger-text/border/soft` | `#b42318`/`#fda29b`/`#fff5f5` | `#ffb3b8`/`#8a3c43`/`#351d20` | 错误态 |
| `--shadow-sm` | 细阴影 | 细阴影（深色更黑） | DataTable 卡片阴影 |

统一容器外边距：`.mdx-component { margin: 18px 0; }` —— 所有五个组件的最外层容器都会带这个 class。

---

## 1. DataTable

### 1.1 DOM 结构骨架

```html
<div class="mdx-component mdx-data-table" data-mdx-component="DataTable">
  <div class="table-card is-{simple|complex}-table[ is-sticky-header]"
       data-enhanced-table                          <!-- 仅当 toolbar=true 时存在 -->
       data-table-complexity="{simple|complex}"
       data-table-layout="{fit|wrap|scroll}"
       style="--table-preferred-width: {n}px; --table-min-width: {n}px;">
    <!-- 工具栏，仅当 search/freeze/copy 任一为 true 时输出 -->
    <div class="table-toolbar">
      <label class="table-search">
        <input type="search" data-table-search aria-label="筛选当前表格" placeholder="…">
      </label>
      <label class="table-toggle">
        <input type="checkbox" data-table-freeze> 冻结首列
      </label>
      <button type="button" data-table-copy>复制 CSV</button>
    </div>
    <div class="table-scroll" data-table-layout="{fit|wrap|scroll}" style="--table-preferred-width:…; --table-min-width:…;">
      <table>
        <colgroup>
          <col style="width: {px 或 %}">  <!-- 每列一个 -->
        </colgroup>
        <caption>{title}</caption>  <!-- 仅当 attributes.title 存在 -->
        <thead>
          <tr><th>{列显示名}</th>…</tr>
        </thead>
        <tbody>
          <tr><td>{单元格值}</td>…</tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
```

三层嵌套是刻意的：`.mdx-data-table`（组件外壳，负责 `margin: 18px 0`）→ `.table-card`（负责边框/圆角/阴影/宽度约束，`box-shadow: var(--shadow-sm)` 由 `.mdx-data-table .table-card` 规则单独加上）→ `.table-scroll`（负责横向滚动裁切）。

### 1.2 视觉语义

- **列（columns）来源**：`attributes.columns`（逗号分隔字符串）显式指定顺序；否则取所有行 keys 的并集，保序（`columnsForRows`，`mdx-lite.mjs:1219`）。
- **表头文字**：`attributes.columnLabels`（一个对象 `{列名: 显示名}`）可覆盖表头文案；缺省用列名本身（`displayColumn`，`mdx-lite.mjs:259`）。外部 dataset 场景下，`columnLabels` 由 manifest 里每个 field 的 `label` 字段自动生成（见 `dataset-query.mjs:216`），组件属性上的 `<field>Label` 也可覆盖。
- **单元格值**：`row[column] ?? ""`，直接 `escapeHtml`，**无任何格式化**（无货币符号、无百分号、无千分位）——展示什么完全取决于源数据字符串本身。
- **caption（表格标题）**：仅当 `attributes.title` 存在时输出 `<caption>`，`caption-side: top`，视觉上是表格内部顶端的加粗标题行（不是组件级的 `mdx-component-title`，DataTable 不用后者）。
- **列宽/布局算法**（`table-layout.mjs`，重要，Mosaic 需要复刻或简化）：
  1. 对每列做 `columnKind` 分类：`number`（全部数字样式）、`date`（`YYYY-MM-DD`/`MM-DD` 样式）、`detail`（表头含"口径/路径/说明/备注/描述/来源/依据/公式/计算/规则/原因"等中文关键词，或单元格含"= / 源表 / 合并表 / 口径 / 路径 / 快照"）、`hardToken`（最长 token ≥42 字符，如长 ID）、`longText`（最长字符 ≥48 或平均长度 ≥26）、`token`（短且低唯一率，如枚举/状态列）、`text`（默认）。
  2. 每类有独立的 `[min, max]` 像素宽度范围（如 `number: 64-108`，`date: 96-132`，`detail: 180-420`，`hardToken: 180-560`）与独立的宽度计算公式（基于字符可视长度 `visualLength`：中日韩字符记 1，ASCII 记 0.58）。
  3. 汇总各列宽度得到 `measuredWidth`；决定整体布局模式：
     - **`scroll`**：列数 ≥8，或 `minWidth`（各列最小宽度之和）>920px，或存在 hardToken 列且总宽 >760px → 横向滚动，表格用固定像素宽 `table-layout: fixed`，容器 `overflow-x: auto`。
     - **`fit`**：不满足 scroll 条件，且目标宽度 ≤620px 且列数 ≤3 → 表格 100% 宽度，`table-layout: fixed`，列宽按百分比分配（`renderTableColgroup` 用 `%`）。
     - **`wrap`**：其余情况（列数适中但内容需要换行）→ 同样 100% 宽度 + 固定布局，但允许长文本换行（`overflow-wrap: break-word` 是 `td` 的默认样式）。
  4. 非 scroll 模式下，会把多余宽度（"呼吸空间"）按列类型权重（`expansionWeight`：detail=3, longText=2, hardToken=1.5, text=1.25, token=0.35, number/date=0.25）分配回各列，让内容列优先扩宽。
  5. **Mosaic 简化建议**：完整复刻这套启发式成本较高；可先按"列数 ≥8 或最长单元格很长 → 横向滚动；否则表格自适应宽度 + 长文本换行"这个粗粒度规则实现，视觉上已经能覆盖大多数场景。

### 1.3 复杂度与工具栏判定（`table-complexity.mjs`）

默认策略"保守"——不是所有表都带工具栏：

- **complex 判定**（`tableComplexityAttributes`）：`rows > 20` 或 `columns >= 8` 或 `rows*columns > 100` 或 最长单元格字符数 `>= 120`；`attributes.complexity="simple"|"complex"` 可强制覆盖。
- 由 complexity 派生四个默认值（均可被属性显式覆盖为 `true/false`）：
  - `search`：仅当 complex 且 `rows > 100` 时默认开启（`attributes.search`）。
  - `freezeFirstColumn`：仅当 complex 且 `rows > 20` 且 `columns >= 6` 时默认开启（`attributes.freezeFirstColumn` 或 `freeze`）。
  - `copyCsv`：complex 即默认开启（`attributes.copyCsv` 或 `copy`）。
  - `stickyHeader`：complex 且 `rows > 20` 时默认开启（`attributes.stickyHeader` 或 `sticky`）。
  - `toolbar = search || freezeFirstColumn || copyCsv`（决定要不要渲染 `.table-toolbar` 这个 DOM 块；stickyHeader 不影响是否渲染工具栏，只影响 `.table-card` 的 class）。
- boolean 覆盖解析接受 `true/false/"true"/"false"/"1"/"0"/"yes"/"no"/"on"/"off"`（大小写不敏感）。

### 1.4 交互行为（`public/app.js:9417` `enhanceTables`）

纯 vanilla JS，事件委托在渲染后一次性对每个 `[data-enhanced-table]` 挂载（用 `dataset.tableEnhanced` 防重复绑定）：

- **Search**（`input` 事件）：对 `needle = value.trim().toLowerCase()`，逐行判断 `row.textContent.toLowerCase().includes(needle)`，不匹配则 `row.hidden = true`。**是纯文本包含匹配，不是列级过滤，不高亮匹配片段**。
- **Copy CSV**（`click` 事件）：调用 `tableToCsv(table)` 把当前 DOM 表格（含表头，考虑 `hidden` 行会被排除吗——需注意：`tableToCsv` 实现在别处，本次未展开读取，行为按标准 CSV 序列化理解即可）写入剪贴板，Toast 提示。
- **Freeze first column**（`change` 事件，checkbox）：切换 `.table-card` 的 `.is-first-column-frozen` class；CSS 用 `position: sticky; left: 0` 把首列固定，`box-shadow: 1px 0 0 var(--panel-border)` 做分隔阴影，表头首列 `z-index: 2` 高于普通首列。
- **Sticky header**：不是运行时交互，是渲染期直接烙进 class `.is-sticky-header`，对应 CSS `th { position: sticky; top: 0; z-index: 1; }`。
- **无排序功能**（DataTable 不支持点击表头排序）。
- 外部 dataset 场景额外有 granularity 切换按钮（day/week/month/quarter），见 `dataset-view.js`；这是"换一批数据重新渲染整个组件"，不是表格内交互，Mosaic 若不做 dataset 桥接可忽略。

### 1.5 空/错误状态

`rows.length === 0 || columns.length === 0` → 走 `componentError("DataTable", new Error("DataTable requires CSV, JSON, or a Markdown table."), translate)`，产出：

```html
<div class="mdx-component-error" data-mdx-component="DataTable">MDX 组件渲染失败：DataTable requires CSV, JSON, or a Markdown table.</div>
```

CSS：`border: 1px solid var(--danger-border); background: var(--danger-soft); color: var(--danger-text); border-radius: 8px; padding: 10px 12px; font-size: 13px;`。这是**全部五个组件共享的统一错误态**，Mosaic 应实现为一个通用 `ComponentError` 展示组件，文案模板是 `component.error: "Failed to render MDX component: {message}"` / 中文 `"MDX 组件渲染失败：{message}"`。

---

## 2. MetricGrid

### 2.1 DOM 结构骨架

```html
<section class="mdx-component mdx-metric-grid" data-mdx-component="MetricGrid">
  <h3 class="mdx-component-title">{title}</h3>  <!-- 仅当 attributes.title -->
  <div class="mdx-metric-grid-items">
    <article class="mdx-metric-item is-{good|risk|watch|neutral}">
      <span class="mdx-metric-label">{label}</span>   <!-- 仅当非空 -->
      <strong>{value}</strong>                          <!-- 仅当非空 -->
      <span class="mdx-metric-delta">{delta}</span>     <!-- 仅当非空 -->
      <p>{note}</p>                                     <!-- 仅当非空 -->
    </article>
    <!-- 重复 N 个 item -->
  </div>
</section>
```

### 2.2 视觉语义

- **布局**：CSS Grid，`grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`，`gap: 10px`——即**自适应列数的响应式网格**，卡片最小宽 150px，容器越宽列数越多，不是固定 2/3/4 列。
- **字段映射**（`renderMetricGrid`，`mdx-lite.mjs:356`，别名解析优先级从左到右取第一个非空）：
  - `label`：`row.label ?? row.metric ?? row.name ?? row.title`
  - `value`（主数值，粗体大字）：`row.value ?? row.current ?? row.amount ?? row.count`
  - `delta`（变化量，次级文字）：`row.delta ?? row.change ?? row.mom ?? row.yoy`
  - `note`（说明，弱化小字）：`row.note ?? row.description ?? row.source ?? row.body`
  - 无 label 且无 value 的行会被过滤掉（`items.filter(item => item.label || item.value)`）。
- **status 归一化与视觉映射**（`normalizeMetricStatus`，`mdx-lite.mjs:1367`）——来源可以是显式 `row.status`，也可以退化用 `row.trend`/`row.delta`/`row.change` 字段猜测：
  | 归一化结果 | 命中输入 | 视觉效果 |
  | --- | --- | --- |
  | `good` | `good/up/positive/success/active`，或值以 `+` 开头 | `.mdx-metric-item.is-good`：`border-top: 3px solid #16a34a`（绿） |
  | `risk` | `risk/warning/blocked/down/negative`，或值以 `-` 开头 | `.is-risk`：`border-top: 3px solid #dc2626`（红） |
  | `watch` | `watch/flat/neutral` | `.is-watch`：`border-top: 3px solid #d97706`（橙） |
  | 其他/未指定 | — | 无特殊边框（用默认 `.mdx-metric-item` 样式，`border-top` 缺省 = 普通 1px 边框颜色） |

  注意：这三个状态色是**硬编码 hex**（不是 CSS 变量），light/dark 主题下不变——Mosaic 若要遵循"跟随 Obsidian 主题"的既有约定（见项目记忆：mosaic 有主题重渲染陷阱），这里可以选择保留硬编码或映射到 Obsidian 的语义色，需要设计决策。

- 卡片本身样式：`min-height: 112px`，`border: 1px solid var(--panel-border)`，`background: var(--panel-muted)`，`padding: 12px`，`border-radius: 8px`；内部 `display: grid; gap: 5px`（label→value→delta→note 纵向堆叠，无强制固定高度对齐）。
- `label`：`color: var(--muted); font-size: 12px; font-weight: 720`。`value`（`<strong>`）：`font-size: 24px; font-weight: 780; color: var(--text)`。`delta`：`font-size: 13px; font-weight: 650; color: var(--text-secondary)`（delta 本身不带正负号颜色区分，与 status 边框色解耦）。`note`（`<p>`）：`font-size: 12px; color: var(--muted)`。

### 2.3 交互行为

无。纯静态展示，无点击/排序/筛选。

### 2.4 空/错误状态

`rows.length === 0` → `componentError("MetricGrid", "MetricGrid requires CSV, JSON, or a Markdown table.")`，同 §1.5 通用错误块。（注意：即使 rows 非空但过滤后 `items` 为空，也不会二次报错，只会渲染一个空的 `.mdx-metric-grid-items` 容器——这是当前实现的一个边界情况，Mosaic 复刻时应留意是否要对齐这个"静默空网格"行为。）

---

## 3. Timeline

### 3.1 DOM 结构骨架

```html
<section class="mdx-component mdx-timeline" data-mdx-component="Timeline">
  <h3 class="mdx-component-title">{title}</h3>  <!-- 仅当 attributes.title -->
  <ol class="mdx-timeline-list">
    <li class="mdx-timeline-item is-{done|active|blocked|default}">
      <div class="mdx-timeline-marker" aria-hidden="true"></div>
      <div class="mdx-timeline-content">
        <time>{date}</time>          <!-- 仅当非空 -->
        <strong>{title}</strong>     <!-- 仅当非空 -->
        <p>{body}</p>                <!-- 仅当非空 -->
        <span class="mdx-timeline-meta">{owner}</span>  <!-- 仅当非空 -->
      </div>
    </li>
    <!-- 重复 N 个 item -->
  </ol>
</section>
```

### 3.2 视觉语义

- **布局**：纵向列表（`<ol>`），每个 `<li>` 是一个两列 grid：`grid-template-columns: 18px minmax(0, 1fr)`（左侧固定 18px 给圆点标记，右侧内容自适应）。
- **竖线连接**：不是靠 `<hr>` 或额外元素，而是 `.mdx-timeline-item::before` 伪元素，`position: absolute; left: 6px; top: 17px; bottom: 0; width: 2px; background: var(--panel-border)`——即每一项自己画一条从自身圆点往下延伸到下一项的竖线；**最后一项**通过 `:last-child::before { display: none }` 去掉多余的线。这是标准的"时间轴竖线由每个节点自身绘制、末项截断"模式，Mosaic 用 CSS 伪元素或等效边框即可复刻，不需要额外 SVG。
- **圆点标记**（`.mdx-timeline-marker`）：14×14px 圆形，`border: 3px solid var(--muted-soft)`，`background: var(--panel)`（挖空效果，露出卡片底色），`z-index: 1` 保证盖在竖线之上。
- **字段映射**（`renderTimelineItem`，`mdx-lite.mjs:301`）：
  - `date`：`row.date ?? row.time ?? row.month`
  - `title`：`row.title ?? row.name ?? row.event`
  - `body`：`row.body ?? row.description ?? row.summary ?? row.note`
  - `owner`：`row.owner ?? row.assignee`
- **status 归一化与圆点颜色**（`normalizeStatus`，`mdx-lite.mjs:1352`，默认值 `"default"`）：
  | 归一化结果 | 命中输入 | 圆点边框色 |
  | --- | --- | --- |
  | `done` | `done/complete/completed/success` | `#16a34a`（绿） |
  | `active` | `active/doing/progress/in-progress` | `var(--accent)`（跟随主题强调色） |
  | `blocked` | `blocked/risk/warning` | `#d97706`（橙） |
  | `default` | 其他/未指定 | `var(--muted-soft)`（灰，即卡片默认色，不特殊处理） |

  注意与 MetricGrid 不同：`done`/`blocked` 用硬编码色，但 `active` 用 `var(--accent)` 会跟随 Obsidian 主题变化——这是唯一一个跟主题联动的状态色，Mosaic 实现时要注意区分对待。

- 文字样式：`time`：`font-size: 12px; font-weight: 650; color: var(--muted)`。`strong`（标题）：`font-size: 14px; color: var(--text)`。`p`（正文）：`font-size: 13px; color: var(--text-secondary); line-height: 1.5`。`.mdx-timeline-meta`（owner）：`font-size: 12px; color: var(--muted)`。
- 外壳：`.mdx-timeline` 卡片本身 `border + border-radius: 8px + background: var(--panel) + padding: 14px 16px`（与 MetricGrid/DecisionBox 外壳视觉一致，是这三者共享的"卡片容器"样式模式）。

### 3.3 交互行为

无。纯静态展示，无折叠/无点击。

### 3.4 空/错误状态

`rows.length === 0` → `componentError("Timeline", "Timeline requires CSV or JSON rows.")`，同 §1.5 通用错误块。（Timeline 对"字段全为空的行"不做过滤，只要 `rows` 数组非空就会渲染出对应数量的 `<li>`，哪怕每个字段都是空字符串——四个可选子元素各自 `?  : ""` 判空，所以最坏情况是一个只有圆点没有内容的空 `<li>`。）

---

## 4. DecisionBox

### 4.1 DOM 结构骨架（有 label/value 数据时）

```html
<section class="mdx-component mdx-decision-box is-{accepted|proposed|rejected|superseded|default}"
         data-mdx-component="DecisionBox">
  <div class="mdx-decision-header">
    <span class="mdx-component-kicker">决策</span>            <!-- 固定文案，翻译自 decision.kicker -->
    <h3 class="mdx-component-title">{title}</h3>              <!-- 仅当 attributes.title -->
    <div class="mdx-decision-badges">
      <span class="mdx-decision-badge">{status}</span>        <!-- 仅当有 status -->
      <span class="mdx-decision-badge">{owner}</span>         <!-- 仅当有 owner -->
      <span class="mdx-decision-badge">{source}</span>        <!-- 仅当有 source -->
    </div>
  </div>
  <dl class="mdx-decision-list">
    <div>
      <dt>{label}</dt>
      <dd>{value，支持内联 `code` 与 **bold**}</dd>
    </div>
    <!-- 重复 N 组 -->
  </dl>
</section>
```

### 4.2 DOM 结构骨架（无结构化 label/value 数据，退化为富文本）

当 body 数据解析不出任何 `label`/`value` 组合行时（`items.length === 0`），不报错，而是把整段 body 当作 **Markdown-lite 富文本** 渲染（`renderRichBlock`，见 §4.5）：

```html
<section class="mdx-component mdx-decision-box is-{status}" data-mdx-component="DecisionBox">
  <div class="mdx-decision-header">…</div>
  <div class="mdx-decision-body">
    <p>{段落，支持内联 code/bold}</p>
    <ul><li>{列表项}</li></ul>
  </div>
</section>
```

### 4.3 视觉语义

- **字段映射**（`renderDecisionBox`，`mdx-lite.mjs:320`）：`label`：`row.label ?? row.key ?? row.name ?? row.item`；`value`：`row.value ?? row.text ?? row.body ?? row.description ?? row.summary`；两者都空的行被过滤。
- **kicker**（"决策"/"Decision"小标签）：**固定文案**，不是数据字段，永远显示在标题上方，`text-transform: uppercase; font-size: 11px; font-weight: 760; color: var(--muted)`。
- **badges（徽标）**：最多三个，来自 `attributes.status`（或 `attributes.decisionStatus`）、`attributes.owner`、`attributes.source`，**顺序固定**，样式统一（药丸形 `border-radius: 999px`，`background: var(--panel-weak)`，`color: var(--text-secondary)`）——即 status 既决定整个 box 的边框/背景变体（is-accepted 等），**也**同时作为一个普通徽标文字展示，两者独立。
- **status 归一化**（`normalizeDecisionStatus`，`mdx-lite.mjs:1360`）：`accepted/proposed/rejected/superseded` 原样保留；`done/complete/completed` 映射为 `accepted`；有值但不认识的映射为 `default`；无值则返回空字符串（此时 class 是 `is-default`，因为渲染代码是 `is-${status || "default"}`）。
- **决策项两列布局**（`.mdx-decision-list > div`）：`grid-template-columns: minmax(86px, 0.24fr) minmax(0, 1fr)`——左侧 label 列窄（最小 86px，约占 24% 宽度），右侧 value 列宽；每组之间 `border-top: 1px solid var(--panel-border)` 分隔线。
- **内联富文本渲染**（`renderInlineText`，`mdx-lite.mjs:959`）：value/富文本正文支持极简 markdown 内联语法——只处理反引号 `` `code` `` → `<code>` 和 `**bold**` → `<strong>`，**不支持**斜体、链接、删除线等。这是一个刻意的小子集。
- 外壳样式与 Timeline/MetricGrid 一致（border + radius 8 + `var(--panel)` 背景 + `14px 16px` padding）。

### 4.4 status 目前**没有**颜色变体差异

代码里 `is-${status}` class 确实存在（`accepted`/`proposed`/`rejected`/`superseded`/`default`），但检索 CSS 全文（`grep mdx-decision-box`）发现**只有 `.mdx-decision-box` 一条基础规则，没有 `.mdx-decision-box.is-accepted` 等针对不同 status 的差异化样式**——也就是说当前 git-leaf 实现里这些 class 目前是"预留但未接颜色"的状态，视觉上四种 status 长得完全一样，只有徽标文字不同。**Mosaic 复刻时这是一个可以按需增强的点**（比如给 accepted 加绿色左边框、rejected 加红色），但不属于"忠实复刻现状"的必需项；如果目标是逐像素对齐，应保持无差异。

### 4.5 `renderRichBlock` 的解析规则（`mdx-lite.mjs:919`）

极简两态状态机，逐行扫描去除首尾空白后的 body 文本（先经 `stripTextFence` 剥掉 ` ```md/markdown/text/txt ``` ` 围栏）：
- 空行 → flush 当前段落/列表。
- 匹配 `^[-*]\s+(.+)$` → 归入当前列表（bullet list）。
- 其他非空行 → 拼入当前段落（多行会用空格 join 成一个 `<p>`，不保留换行）。
- 结尾统一 `<ul><li>…</li></ul>` 或 `<p>…</p>`，两者都过 `renderInlineText`。

### 4.6 交互行为

无。

### 4.7 空/错误状态

DecisionBox **没有"空数据报错"路径**——即使 body 完全没有可解析内容，`extractRows` 返回空数组、`renderRichBlock` 也会对空字符串返回空数组 `blocks=[]`，最终 `.mdx-decision-body` 就是一个空 div，不会走 `componentError`。这是与 DataTable/Timeline/MetricGrid/FlowDiagram 明显不同的一点：**DecisionBox 永远不会渲染错误态**（除非 JSON/CSV 本身解析抛异常，比如格式不合法的 JSON，那会被外层 try/catch 兜底为通用错误块）。

---

## 5. FlowDiagram

这是五个组件里**唯一涉及自研布局算法**的一个，也是 Mosaic 实现难度最高的一块。结论先行：**纯 SVG + 手写分层（layered/Sugiyama 风格）DAG 布局算法，没有使用任何图形库（无 D3-dagre、无 elkjs、无 Mermaid）**。

### 5.1 绘制方式

- 输出是一个内联 `<svg viewBox="0 0 W H">`，尺寸由布局算法算出的画布宽高决定（不是固定值）。
- 节点是 `<rect rx="8">` + `<text>`（多行用 `<tspan>` 手动换行），边是三次贝塞尔 `<path>` + 箭头 `<marker>`。
- 没有 pan/zoom/拖拽（纯静态图，只有外层容器可以横向滚动）。

### 5.2 DOM/SVG 结构骨架

```html
<figure class="mdx-component mdx-flow-diagram" data-mdx-component="FlowDiagram">
  <figcaption>{title}</figcaption>  <!-- 仅当 attributes.title -->
  <div class="mdx-flow-scroll">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label="{title 或 '流程图'}">
      <defs>
        <marker id="mdx-flow-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z"></path>
        </marker>
      </defs>
      <!-- 先画所有边，再画所有节点（保证节点盖在边上层） -->
      <path class="mdx-flow-edge" d="M sx sy C sx midY, tx midY, tx ty" marker-end="url(#mdx-flow-arrow)"></path>
      <text class="mdx-flow-edge-label" x="…" y="…" text-anchor="middle">{edge.label}</text>  <!-- 可选 -->
      <!-- …重复每条边… -->
      <g class="mdx-flow-node is-{start|end|action|decision|gate|risk}">
        <title>{node.note}</title>  <!-- 可选，浏览器原生 tooltip -->
        <rect x="…" y="…" width="200" height="64" rx="8"></rect>
        <text text-anchor="middle">
          <tspan x="…" y="…">{折行后第 1 行}</tspan>
          <tspan x="…" y="…">{折行后第 2 行}</tspan>
        </text>
      </g>
      <!-- …重复每个节点… -->
    </svg>
  </div>
  <p class="mdx-flow-note">{attributes.note}</p>  <!-- 仅当存在 -->
</figure>
```

### 5.3 数据模型解析（`extractFlowDiagram`，`mdx-lite.mjs:974`）

两种输入形式：
1. **JSON 对象形式**（推荐）：`{ "nodes": [...], "edges": [...] }`（`edges` 也接受别名 `links`）。
2. **行式（CSV/表格）形式**：每行是一个节点，`next`（或 `to`）字段用逗号分隔多个后继节点 id，渲染时自动展开成边列表（`listAttribute(node.next)` → 多条 `{from, to, label:""}`）。

节点归一化（`normalizeFlowDiagram`，`mdx-lite.mjs:994`）：
- `id`：`node.id ?? node.key ?? 序号`（1-based），trim 后为空的节点被丢弃。
- `label`：`node.label ?? node.title ?? node.name ?? id`。
- `type`：归一化见下表。
- `note`：`node.note ?? node.description ?? ""`——渲染为 SVG `<title>`（原生 hover tooltip，唯一的"交互"）。
- `next`：仅行式输入使用，用于生成隐式边。

边归一化：`from`/`to` 支持 `source`/`target` 别名；`label` 支持 `title` 别名；**过滤掉任何 from/to 不在节点 id 集合中的边**（不会报错，静默丢弃非法边）。

**类型归一化**（`normalizeFlowType`，`mdx-lite.mjs:1377`，默认值 `"action"`）：
| 归一化结果 | 命中输入 |
| --- | --- |
| `start` | 显式 `start` |
| `end` | 显式 `end` |
| `decision` | 显式 `decision`，或 `question/branch/condition` |
| `gate` | 显式 `gate` |
| `risk` | 显式 `risk`，或 `warning/blocked/error` |
| `action`（默认） | 其他任意值或未指定 |

### 5.4 布局算法（`layoutFlowDiagram` + `computeFlowLevels`，`mdx-lite.mjs:1020`/`1051`）——需要精确复刻的核心

**第一步：计算每个节点的层级（level / 纵向层）——拓扑排序 + 最长路径**（`computeFlowLevels`）：
1. 对每个节点初始化 `level = 0`，`indegree = 0`。
2. 遍历所有边，累加 `indegree`，并建立 `outgoing` 邻接表（跳过引用了不存在节点的边——理论上此时边已经被 `normalizeFlowDiagram` 过滤过了）。
3. BFS 拓扑排序：初始队列 = 所有 `indegree === 0` 的节点。出队一个节点时，对其所有出边目标 `target`：`level[target] = max(level[target], level[current] + 1)`，`indegree[target] -= 1`，若降为 0 则入队。
4. **这是最长路径分层（longest-path layering）**，不是简单 BFS 层——如果一个节点有两条不同长度的入边路径，它的 level 取较深的那条，保证同层内没有"跨层"边的视觉冲突（边总是从上一层指向下一层或更深层，但绘制算法只按"相邻层"处理，见下）。
5. **环处理**：若图中存在环，环内节点在 BFS 中永远不会被访问到（`seen` 集合不包含它们）。循环结束后，对所有 `!seen.has(id)` 的节点，按遍历顺序（node 数组顺序，不是拓扑序）依次追加到 `fallbackLevel = max(现有所有 level) + 1, +2, +3…`——即**每个孤立/环内节点单独占一层，追加在最深层之后**，避免死循环，但不做真正的环布局优化。

**第二步：按层分组，计算画布尺寸与每个节点的 (x, y)**（`layoutFlowDiagram`）：
- 常量：`nodeW = 200`，`nodeH = 64`，`xGap = 34`（同层节点间横向间距），`yGap = 74`（层间纵向间距），`margin = 28`（画布四周留白）。
- `maxCols = 每层节点数的最大值`；`width = max(760, margin*2 + maxCols*nodeW + (maxCols-1)*xGap)`（画布宽度取 760 与"最宽一层撑满宽度"两者较大值——保证窄图也有最小宽度）。
- `height = margin*2 + 层数*nodeH + (层数-1)*yGap`。
- 每层内部**水平居中**：`rowW = 该层节点数*nodeW + (节点数-1)*xGap`；起始 `x = (width - rowW) / 2`，然后每个节点依次 `x += nodeW + xGap`。层内节点顺序 = 节点在该层分组数组中的原始遍历顺序（即输入 nodes 数组顺序按 level 分桶后的顺序，**不做同层节点顺序优化/交叉最小化**，这是与专业 dagre/elk 布局的关键差异——复杂图可能出现边交叉）。
- `y = margin + level*(nodeH + yGap)`（层与层之间固定纵向间距，从上到下）。

**第三步：边的绘制**（`renderFlowEdge`，`mdx-lite.mjs:1085`）：
- 起点 = `from` 节点底边中点 `(from.x + from.width/2, from.y + from.height)`；终点 = `to` 节点顶边中点。
- `midY = sy + (ty - sy) / 2`（起终点纵坐标中点）。
- 三次贝塞尔：`M sx sy C sx midY, tx midY, tx ty`——即控制点分别在起点正下方 `midY` 处、终点正上方 `midY` 处，形成经典的"S 形"竖直流程连接线（水平切线进出节点）。
- 若某条边的 from/to 在 `positions` map 中找不到（理论上不会发生，因为已经过滤过），静默跳过（返回空字符串）。
- 边 label（若有）：绘制在 `((sx+tx)/2, midY - 7)`，居中文字，`paint-order: stroke; stroke: var(--panel); stroke-width: 4px`（描边效果让文字在穿过的线条上依然可读，这是常见的"文字抠底"SVG 技巧）。

**第四步：节点文字自动折行**（`wrapFlowText`，`mdx-lite.mjs:1124`，`maxWidth=14` 字符单位，`maxLines=3`）：
- 按字符遍历，每个字符按"视觉宽度"累加（非 ASCII 字符权重 1，ASCII 字符权重 0.56），超过 `maxWidth=14` 就换行。
- 超过 3 行会截断第 3 行为 `slice(0, maxWidth-3) + "..."`。
- 多行文字用 `<tspan>` 逐行输出，`lineHeight = 15px`，整体在节点内垂直居中（`firstY` 公式让多行文本块的中心对齐节点中心）。

**Mosaic 实现建议**：这套算法本质是标准的"分层 DAG 布局 + 层内居中 + 三次贝塞尔连接"，**不依赖任何外部库**，用纯 JS/TS 在 Mosaic 里原样移植是完全可行的（大约 150 行代码，上面已给出全部常量与公式）。不建议引入 D3/dagre 等重量级依赖去"更好地"布局——那样反而会产生与 git-leaf 视觉不一致的结果（尤其是同层节点顺序、边的弯曲方式）。如果 Mosaic 需要处理带环的图，注意第 5 步的"环节点各自单独成层"这个退化规则也要复刻，否则视觉差异会很明显。

### 5.5 节点类型颜色（唯一保留硬编码 hex 的地方）

```css
.mdx-flow-node rect       { fill: var(--panel-muted); stroke: var(--panel-border); stroke-width: 1.5; }  /* action 默认 */
.mdx-flow-node text       { fill: var(--text); font-size: 13px; font-weight: 720; }
.mdx-flow-node.is-start rect, .mdx-flow-node.is-end rect   { fill: #f0fdf4; stroke: #16a34a; }   /* 浅绿底 + 绿边 */
.mdx-flow-node.is-start text, .mdx-flow-node.is-end text   { fill: #14532d; }                     /* 深绿字 */
.mdx-flow-node.is-decision rect { fill: #fffbeb; stroke: #d97706; }                                /* 浅橙底 + 橙边 */
.mdx-flow-node.is-decision text { fill: #92400e; }
.mdx-flow-node.is-gate rect     { fill: #eef4ff; stroke: var(--accent); }                          /* 浅蓝底 + 强调色边（跟随主题） */
.mdx-flow-node.is-gate text     { fill: #1e3a8a; }
.mdx-flow-node.is-risk rect     { fill: #fff1f2; stroke: #dc2626; }                                /* 浅红底 + 红边 */
.mdx-flow-node.is-risk text     { fill: #991b1b; }
```

**这些颜色在 light/dark 主题下完全不变**（不是 CSS 变量，是字面 hex），只有 `gate` 类型的边框色用 `var(--accent)` 跟随主题。这与 Mosaic"跟随 Obsidian 主题"的既定方向存在潜在冲突（见项目记忆的"主题重渲染陷阱"），需要产品决策：是逐像素复刻这几个语义色，还是换成 Obsidian 语义化 CSS 变量（如 `--color-green` / `--color-orange` / `--color-red`）。

边样式：`.mdx-flow-edge { stroke: var(--muted-soft); stroke-width: 1.7; fill: none; }`（跟随主题的灰色线）。

### 5.6 交互行为

无。（容器 `.mdx-flow-scroll` 支持横向滚动；节点唯一的"交互"是浏览器原生 `<title>` hover tooltip 显示 `note`。）

### 5.7 空/错误状态

`model.nodes.length === 0` → `componentError("FlowDiagram", "FlowDiagram requires nodes.")`，同 §1.5 通用错误块。

---

## 6. 跨组件共享基础设施（Mosaic 复刻时建议抽公共层）

### 6.1 数据解析（`extractRows` / `extractDataBlock`，五个组件除 DecisionBox 富文本分支外全部复用）

优先级：
1. body 是一个 fenced code block（` ```{format} ... ``` `，format 缺省视为 `csv`）→ 按声明的 format 解析：`json` → `rowsFromJson`（数组或 `{rows:[...]}`）；`tsv` → 按 tab 分隔；其余（含 `csv`）→ 按逗号分隔。
2. 无 fence，内容以 `[`/`{` 开头 → 当 JSON 解析。
3. 内容含 `|` → 当 Markdown table 解析（要求至少 3 行：表头/分隔线/数据行）。
4. 否则退化按裸 CSV 解析。

CSV/TSV 解析细节：首行是表头，逐单元格 `parseCell` 处理——严格匹配整数/小数正则 `^-?\d+(?:\.\d+)?$` 才转成 JS number，否则保留字符串（意味着 `"1,234"`、`"$5"`、`"50%"` 都不会被当成数字，原样字符串展示）。全空的行会被跳过。

### 6.2 通用错误组件

```html
<div class="mdx-component-error" data-mdx-component="{ComponentName}">{翻译后的错误文案}</div>
```
CSS：`border: 1px solid var(--danger-border); border-radius: 8px; background: var(--danger-soft); color: var(--danger-text); padding: 10px 12px; font-size: 13px;`

文案模板（`MDX_MESSAGES["component.error"]`）：
- en: `Failed to render MDX component: {message}`
- zh-CN: `MDX 组件渲染失败：{message}`

### 6.3 组件标题/kicker 共享样式

`.mdx-component-title`（Timeline/DecisionBox/MetricGrid 的 `<h3>`，以及 Chart/FlowDiagram 的 `<figcaption>` 共用同一条规则）：`margin: 0 0 10px; font-size: 15px; font-weight: 760; color: var(--text)`。

`.mdx-component-kicker`（目前只有 DecisionBox 使用）：`display: block; margin-bottom: 4px; font-size: 11px; font-weight: 760; text-transform: uppercase; color: var(--muted)`。

### 6.4 三种"卡片外壳"视觉模式

- **模式 A（带边框卡片）**：Timeline / DecisionBox / MetricGrid 共用——`border: 1px solid var(--panel-border); border-radius: 8px; background: var(--panel); padding: 14px 16px`。
- **模式 B（表格专用外壳）**：DataTable 的 `.table-card`——同样 border+radius，但额外加 `box-shadow: var(--shadow-sm)`（仅 DataTable 有阴影），且宽度受 `--table-preferred-width` 变量控制。
- **模式 C（图形专用外壳）**：FlowDiagram（以及 Chart）用 `<figure>` + 相同 border/radius/background，但 `padding: 14px 16px 10px`（底部 padding 略小，给 note 文字留白）。

### 6.5 i18n 消息全表（`MDX_MESSAGES`，`mdx-lite.mjs:26`）

| key | en | zh-CN |
| --- | --- | --- |
| `component.error` | Failed to render MDX component: {message} | MDX 组件渲染失败：{message} |
| `decision.kicker` | Decision | 决策 |
| `flow.ariaLabel` | Flow diagram | 流程图 |
| `chart.unit` | Unit: {unit} | 单位：{unit}（Chart 专用，五类组件外） |
| `dataset.controls`/`loading`/`day`/`week`/`month`/`quarter` | — | 外部 dataset 专用，DataTable 在 dataset 模式下使用 |

---

## 7. 给 Mosaic 的实现建议汇总

1. **DataTable**：列宽自动布局算法（§1.2）是最值得投入的部分，因为它决定"表格是否好看"；工具栏三件套（search/freeze/copy）逻辑简单，值得完整复刻；**不要**加数值格式化，源数据即展示值。
2. **MetricGrid**：`repeat(auto-fit, minmax(150px,1fr))` 网格 + 三色状态边框是全部视觉重点，实现成本低。
3. **Timeline**：竖线用 CSS 伪元素而非额外 DOM 节点，末项截断竖线；三色状态圆点，其中 `active` 态跟随主题强调色。
4. **DecisionBox**：注意它是唯一"永不报错"的组件，且当前 status 变体在 CSS 层面其实没有视觉差异（只是徽标文字不同）——如果 Mosaic 想做得比原版更好，这里有明确的增强空间，但需与产品对齐是否要"忠实复刻"还是"优化"。
5. **FlowDiagram**：核心是搬运 §5.4 的分层布局算法（最长路径分层 + 层内居中 + 三次贝塞尔连边 + 环节点退化处理），纯手写 SVG，不需要引入图形库；节点类型配色目前是硬编码 hex 而非主题变量，需要产品决策是否要跟随 Obsidian 主题重新映射。
6. **全局**：五个组件共享同一套"卡片外壳"和"统一错误态"视觉语言，Mosaic 应该先抽出这两个基础组件（`ComponentShell` / `ComponentError`），再分别实现五个组件的内部结构，减少重复代码，也保证未来六个组件（含 Chart）视觉统一性。
