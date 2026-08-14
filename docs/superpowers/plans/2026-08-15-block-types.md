# 五类内容块（Block Types）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Mosaic 中实现 git-leaf 其余五类组件（DataTable、MetricGrid、Timeline、DecisionBox、FlowDiagram）的识别、解析与呈现，使同一份 md/mdx 文档在 git-leaf 与 Obsidian 中渲染一致。

**Architecture:** 沿用三段式管线。识别层泛化既有 chart-tag 机制到六组件白名单（标签双形态：自闭合 / 成对+payload）；解析层移植 git-leaf 的 payload 提取与归一化纯函数（extractRows 家族、四个 normalize、FlowDiagram 双形态、表格布局、DAG 布局）；渲染层每类一个 React 视图组件 + 共享错误壳，DataTable 复用已移植的 queryDataset（`component: "DataTable"` 分支现成）。

**Tech Stack:** 纯函数 .mjs（node --test 可测）+ React/Preact 视图 + 手写 SVG（FlowDiagram）+ styles.css。零新增第三方依赖。

**Spec:** 两份逐行取证的研究报告（已随仓库归档）：
- 解析契约：`docs/superpowers/research/block-types-research-parsing.md`
- 渲染规格：`docs/superpowers/research/block-types-research-render.md`
上游源码可直接对照：`~/projects/git-leaf/src/content/`（只读）。

## 决策记录（controller rulings，已入 ledger）

1. 识别层**不移植** git-leaf 的行级探测（宿主 markdown 分段规则不同）；泛化 Mosaic 已验证的 `chart-tag.mjs` 到六组件白名单。属性正则升级为 git-leaf 三形态 `([A-Za-z_][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))`（向后兼容双引号）。
2. 新五类**只做标签入口**：自闭合（仅 DataTable dataset 模式有意义）+ 成对 payload；`chartview` 代码块不扩展。**Chart 的全部既有语义一字不动**（含成对 body 仅认 csv fence）。
3. 成对标签沿用宿主约束：开标签单行、body 内无空行；DecisionBox 富文本受此限制（文档标注与 git-leaf 差异）。
4. 视觉：class 前缀 `mosaic-`（git-leaf 的 `mdx-` 对应替换）；卡片底色/边框/文字映射 Obsidian 主题变量；状态语义色保留 git-leaf 硬编码 hex（#16a34a/#dc2626/#d97706，与 CHART_COLORS 同族）。
5. 错误信息内文与 git-leaf 逐字一致（研究报告引用的 `throw new Error(...)` 字符串）；外壳沿用 `mosaic-error` div + `Mosaic: ` 前缀（不采用 git-leaf 的 i18n 模板层）。
6. `table-complexity` / `table-layout` / flow 布局纯函数**逐字移植**（Apache-2.0，NOTICE 追加条目）；DataTable 工具栏交互（search/freeze/copy）在 React 层实现。

## Global Constraints

- 测试命令固定 `npm test`；构建 `npm run build`；安装测试 vault：`npm run install:vault` 后用 `obsidian vault=test-vault` CLI 验证。生产 vault（mango-os）本批次不再用于测试。
- 纯函数放 `src/blocks/*.mjs`（新目录），不得 import obsidian/react；宿主胶水 .ts/.tsx。缩进 tabs。
- 逐字移植的文件头部标注来源（与既有 dataset-query.mjs 头注释同格式），NOTICE 追加对应条目。
- 现有 84+ 测试一个不许挂；Chart 行为零改变是硬约束。
- 主题机制不动：`mosaic:theme-change`、宽度监听重建、whenHostReady 等既有渲染层基建原样保留并被新组件复用。
- 错误框：cls `mosaic-error`、前缀 `Mosaic: `、内文与 git-leaf 逐字一致。
- 文档中文；截图 `![待补充]`；示例一律一眼假数据。
- Git：feature 分支 `feat/block-types`（从 feat/unified-entry-syntax 顶端开出，继续叠加），按任务 commit，不 push。
- 并行执行约束：wave 1 的任务文件互不相交，可并行派发；每个 implementer 只 stage 自己的文件、遇 index.lock 重试。

## 组件契约速查（从研究报告压缩，实现细节以报告为准）

| 组件 | 属性 | payload | 空数据行为 |
| --- | --- | --- | --- |
| DataTable | title, columns, columnLabels(仅程序注入), complexity, search/freeze/copy/sticky(+别名), dataset, granularity, granularityOptions, from/to | extractRows 四路径；dataset 模式 body 仅 ```query fence | 报错 `DataTable requires CSV, JSON, or a Markdown table.` |
| MetricGrid | title | extractRows；字段别名 label/value/delta/note/status（见报告 §5.3） | 报错 `MetricGrid requires CSV, JSON, or a Markdown table.` |
| Timeline | title | extractRows；字段别名 date/title/body/owner/status | 报错 `Timeline requires CSV or JSON rows.` |
| DecisionBox | title, status(别名 decisionStatus), owner, source | extractRows label/value 行；空则回退富文本 renderRichBlock | **永不报错** |
| FlowDiagram | title, note | 形态A graph JSON / 形态B 行式(next 隐式边)；normalizeFlowDiagram 合流 | 报错 `FlowDiagram requires nodes.` |

状态归一化四函数（normalizeStatus / normalizeDecisionStatus / normalizeMetricStatus / normalizeFlowType）逐字移植，见解析报告 §3-§6 的源码引用。

## 新增/修改文件总览

- Create: `src/blocks/payload.mjs` —— extractDataBlock/extractRows/rowsFromJson/rowsFromDelimited/rowsFromMarkdownTable/parseCell/listAttribute/uniqueStrings + 四个 normalize 函数 + stripTextFence/renderRichBlock 的**解析半部**（见 Task 1）。
- Create: `src/blocks/flow.mjs` —— extractFlowDiagram/normalizeFlowDiagram/computeFlowLevels/layoutFlowDiagram/wrapFlowText（布局输出纯数据）。
- Create: `src/blocks/table-complexity.mjs`、`src/blocks/table-layout.mjs` —— 逐字移植。
- Create: `src/blocks/dataset-table.mjs` —— datasetQueryFromContent（```query fence 解析）。
- Modify: `src/dataset/chart-tag.mjs` —— 泛化为六组件识别（导出 findComponentTags；findChartTags 保留为 Chart 过滤 wrapper）。
- Create: `src/components/blocks/BlockShell.tsx`（标题/kicker/错误共享壳）、`DataTableView.tsx`、`MetricGridView.tsx`、`TimelineView.tsx`、`DecisionBoxView.tsx`、`FlowDiagramView.tsx`。
- Modify: `src/dataset/render-chart.tsx` —— 更名职责为组件分发 `renderComponentInto`（Chart 路径原样，新增五类分支）；`src/dataset/chart-tag-processor.tsx` 消费 findComponentTags。
- Modify: `styles.css` —— 新组件样式（映射表见 Task 5）。
- Modify: `NOTICE` —— 追加移植条目。
- Create: `docs/data-table.md`、`docs/metric-grid.md`、`docs/timeline.md`、`docs/decision-box.md`、`docs/flow-diagram.md`（照 chart.md 体例：写法 + 报错示例子章节）；Modify: README/mosaic-intro 双语/dataset-guide 状态行。
- Create: `test-vault/blocks/` 五页测试文档 + DataTable dataset 用假数据集。
- Test: `tests/payload.test.mjs`、`tests/flow.test.mjs`、`tests/table-layout.test.mjs`、`tests/component-tag.test.mjs`、`tests/dataset-table.test.mjs`。

## 接口契约（跨任务，全部在此定死）

```ts
// src/blocks/payload.mjs
extractDataBlock(content) → { format, body } | null
extractRows(content) → Row[]                       // Row = Record<string, string|number>
parseCell(value) → string | number
listAttribute(value) → string[]
uniqueStrings(values) → string[]
normalizeStatus(v) → "done"|"blocked"|"active"|"default"
normalizeDecisionStatus(v) → "accepted"|"proposed"|"rejected"|"superseded"|"default"|""
normalizeMetricStatus(v) → "good"|"risk"|"watch"|"neutral"
normalizeFlowType(v) → "start"|"end"|"decision"|"gate"|"risk"|"action"
parseRichBlocks(content) → Array<{type:"p"|"ul", lines:string[]}>   // DecisionBox 富文本解析半部
parseInlineText(text) → Array<{type:"text"|"code"|"bold", text:string}> // `code`/**bold** 词法
timelineItem(row) → {status,date,title,body,owner}
metricItem(row) → {label,value,delta,note,status}
decisionItems(rows) → Array<{label,value}>

// src/blocks/flow.mjs
extractFlowDiagram(content) → {nodes, edges}       // 归一化后
layoutFlowDiagram(model) → {width, height, nodes:[{id,label,type,note,x,y,width,height,lines:string[]}], edges:[{fromX,fromY,toX,toY,midY,label}]}

// src/blocks/table-complexity.mjs
tableComplexityAttributes(rows, columns, attributes) → {complexity, search, freezeFirstColumn, copyCsv, stickyHeader, toolbar}

// src/blocks/table-layout.mjs
tableLayout(rows, columns) → {mode:"fit"|"wrap"|"scroll", preferredWidth, minWidth, columnWidths:string[]}  // columnWidths 为 CSS width 值

// src/blocks/dataset-table.mjs
datasetQueryFromContent(content) → object          // 抛错文案与 git-leaf 逐字一致

// src/dataset/chart-tag.mjs
COMPONENT_NAMES = ["DataTable","Timeline","Chart","DecisionBox","MetricGrid","FlowDiagram"]
findComponentTags(text) → Array<{name, start, end, attributes, body: string|null}>
  // 自闭合 body=null；成对 body=开标签 ">" 后到 "</Name>" 之间原文（不再校验 fence）
  // Chart 的 csv 语义由消费方保证：findChartTags(text) 兼容 wrapper 继续返回 {…, csv}
isOnlyComponentTags(text, tags) → boolean

// React 视图统一 props
{ attributes: Record<string,string>, body: string }        // 各视图内部调用 blocks 纯函数
DataTableView 额外接受 { rows?, columnLabels?, meta?, granularity 切换 props }（dataset 模式由集成层注入）
```

---

### Task 0: 分支准备

- [ ] `cd ~/projects/mosaic && git status --short`（须干净）→ `git checkout -b feat/block-types`

---

### Task 1（wave 1，可并行）: payload 纯函数移植

**Files:** Create `src/blocks/payload.mjs`；Test `tests/payload.test.mjs`；Modify `NOTICE`（追加条目）。

**要求**

1. 从 `~/projects/git-leaf/src/content/mdx-lite.mjs` 逐字移植接口契约所列函数（模块私有 → 导出）；`parseDelimitedRecords` 直接 `import { parseDelimitedRecords } from "../dataset/delimited-data.mjs"`（已在库中），不要复制。
2. `parseRichBlocks` / `parseInlineText` 是 git-leaf `renderRichBlock` / `renderInlineText` 的**解析半部**：把 HTML 拼接改为返回结构化数据（契约见上），逻辑判定逐字保留（`stripTextFence` 的语言白名单 `md/markdown/text/txt`、`^[-*]\s+(.+)$`、空行 flush、段落空格 join、`` `code` `` 与 `**bold**` 词法）。
3. `timelineItem` / `metricItem` / `decisionItems` 封装研究报告 §3.3/§5.3/§4.3 的字段别名 `??` 链与过滤规则，逐字对齐。
4. 头注释标注来源（格式仿 `src/dataset/delimited-data.mjs` 第 1-2 行）；NOTICE 追加：`src/blocks/payload.mjs — ported from git-leaf src/content/mdx-lite.mjs (payload extraction & normalization helpers)`。
5. TDD：先写测试再实现。测试覆盖（全部用假数据）：fence 四路径（csv 缺省/tsv/json/无关语言标签退化 csv）、裸 JSON、裸 markdown 表（分隔行跳过）、裸 CSV 兜底、parseCell 严格数字正则（"1,234"/"50%" 保持字符串）、rowsFromJson 两种顶层、全空行过滤、四个 normalize 的全部分支（含 metric 的 +/- 前缀兜底）、richBlocks（段落/列表/围栏剥离）、inlineText（code/bold/普通混排）、timeline/metric/decision 的别名链与过滤。≥25 个用例。
6. `npm test` 全绿（存量 84 + 新增）→ commit：`feat: port git-leaf payload extraction and normalization helpers`（正文说明来源与 NOTICE）。

---

### Task 2（wave 1，可并行）: FlowDiagram 数据与布局

**Files:** Create `src/blocks/flow.mjs`；Test `tests/flow.test.mjs`。

**要求**

1. 逐字移植 `extractFlowDiagram` / `normalizeFlowDiagram` / `computeFlowLevels` / `layoutFlowDiagram` / `wrapFlowText`（来源 mdx-lite.mjs，行号见解析报告 §6 与渲染报告 §5.4）。`extractFlowDiagram` 依赖的 `extractRows`/`listAttribute`/`parseJsonValue` 语义：`parseJsonValue` = 有 fence 时仅 `json` 标签才解析、否则裸文本以 `{`/`[` 开头才解析（报告 §6.1 引用），在本文件内实现（依赖 Task 1 的 `extractDataBlock`/`extractRows` —— import 自 `./payload.mjs`；wave 1 并行时按契约先写 import，联调在测试跑通时自然验证——若 Task 1 未完成先行，implementer 可在本地先写最小 stub 跑红灯，但**提交前必须依赖真实现**，两任务测试互相独立）。
2. `layoutFlowDiagram` 输出改为纯数据（接口契约），SVG 拼接不移植（渲染层做）；布局常量与公式逐字保留：nodeW=200/nodeH=64/xGap=34/yGap=74/margin=28/width=max(760,…)、最长路径分层、环节点各占一层追加、层内水平居中、贝塞尔控制点 midY、wrapFlowText(maxWidth=14, maxLines=3, ASCII 权重 0.56, 截断 "...")。
3. 测试 ≥12：JSON 形态（edges/links 别名、from/source、label/title）、行式 next 隐式边、显式+隐式边叠加、悬空边静默过滤、id 空节点丢弃、类型归一全表、环退化分层、层内居中坐标断言（对 3 节点线性图断言精确 x/y）、wrapFlowText 中英文混排换行与截断、空 nodes（extract 返回空后由渲染层报错——纯函数层返回 {nodes:[],edges:[]} 不抛）。
4. commit：`feat: port FlowDiagram parsing and layered DAG layout`。

---

### Task 3（wave 1，可并行）: 表格复杂度与列宽布局移植

**Files:** Create `src/blocks/table-complexity.mjs`、`src/blocks/table-layout.mjs`；Test `tests/table-layout.test.mjs`；NOTICE 条目（若 Task 1 并行改 NOTICE，遇冲突各自只追加自己的行并重试）。

**要求**

1. 从 `~/projects/git-leaf/src/content/table-complexity.mjs` 与 `table-layout.mjs` 逐字移植（两文件纯函数零依赖）。导出接口按契约（若上游函数名不同，加薄适配导出，不改内部逻辑）。
2. 测试 ≥10：complex 判定四条件（rows>20 / columns≥8 / rows*columns>100 / 最长单元格≥120）、complexity 属性强制覆盖、booleanOverride 全词表、toolbar 派生逻辑、三种布局模式判定（scroll/fit/wrap 的触发条件）、列类型分类抽样（number/date/detail 中文关键词/hardToken≥42/longText）、列宽范围断言。
3. commit：`feat: port table complexity and auto-layout heuristics`。

---

### Task 4（wave 1，可并行）: 识别层泛化

**Files:** Modify `src/dataset/chart-tag.mjs`；Test `tests/chart-tag.test.mjs`（追加，存量用例不动）。

**要求**

1. `OPEN_TAG` 泛化为白名单：`/<(DataTable|Timeline|Chart|DecisionBox|MetricGrid|FlowDiagram)(?=[\s/>])/g`；`ATTR` 升级为三形态正则（决策记录 1；分组语义：值 = 双引号组 ?? 单引号组 ?? 裸值组）。
2. `findComponentTags(text)` 返回 `{name, start, end, attributes, body}`：自闭合 body=null；成对 body=`>` 后到独占检测的 `</Name>` 之间原文（**去掉现有 PAIRED_BODY 的 fence 校验**——body 原文交给解析层；开标签引号感知扫描、畸形弃候选、`parseAttrs` 校验 inner 纯属性对等既有机制全部保留并泛化到六名字）。闭合标签匹配 `</${name}>`。
3. 兼容导出：`findChartTags(text)` = findComponentTags 过滤 name==="Chart" 并将 body 映射回 `csv` 字段——**语义与现状逐字一致**：body 经现有 PAIRED_BODY 正则校验（fence 提取），不匹配则该候选按现状规则丢弃（保证 Chart 行为零变化，存量测试原样通过）。`isOnlyChartTags` 泛化为 `isOnlyComponentTags`（保留旧名 alias）。
4. 测试追加 ≥10：五个新名字各识别一例（自闭合+成对）、单引号/裸值属性、`<UnknownWidget />` 不识别、成对 body 原文透传（含 json fence、含裸文本）、Chart 兼容路径回归（非 csv fence 的 Chart 成对仍被丢弃）、混排段落不接管。
5. commit：`feat: generalize tag recognition to all six component names`。

---

### Task 5（wave 1，可并行）: React 视图组件与样式

**Files:** Create `src/components/blocks/BlockShell.tsx`、`DataTableView.tsx`、`MetricGridView.tsx`、`TimelineView.tsx`、`DecisionBoxView.tsx`、`FlowDiagramView.tsx`；Modify `styles.css`。

**要求**（DOM 结构与 class 名对照渲染报告 §1-§6，`mdx-` → `mosaic-` 前缀替换；本任务只写组件与样式，不接线——按接口契约中的 props 实现，import 自 `../../blocks/*.mjs`（契约已定，wave 1 并行下先按契约书写）；不新增单测（宿主层），验收=esbuild 构建通过（可先在本任务分支内临时加一个空引用防 tree-shake 误报，集成任务会真正接线）。

1. `BlockShell`：卡片外壳（`mosaic-block` + 变体 class）、`<h3 class="mosaic-block-title">`、DecisionBox kicker、统一错误渲染函数 `blockError(name, message)` → 复用现有 `mosaic-error` 样式（内文=git-leaf 原文）。
2. `MetricGridView`：`repeat(auto-fit, minmax(150px,1fr))` 网格；`is-good/risk/watch` 顶边 3px 语义色（#16a34a/#dc2626/#d97706）；label/value/delta/note 字号字重按渲染报告 §2.2。
3. `TimelineView`：`<ol>` 两列 grid（18px 圆点列）；竖线 `::before` 伪元素 + `:last-child` 截断；圆点 done=#16a34a、active=var(--interactive-accent)、blocked=#d97706、default=muted。
4. `DecisionBoxView`：header（kicker/title/badges 药丸）+ `<dl class="mosaic-decision-list">` 两列（minmax(86px,0.24fr)/1fr）或富文本回退 `<div class="mosaic-decision-body">`（段落/ul，inline code/bold 用 parseInlineText 结果映射 `<code>`/`<strong>`）。
5. `DataTableView`：三层结构（`mosaic-data-table` → `table-card`（含 complexity/layout data 属性与 CSS 变量宽度）→ `table-scroll` → `<table>` colgroup/caption/thead/tbody）；工具栏 React 实现——search（行文本 includes 过滤，React state 控制 row hidden）、freeze 首列（切换 class，CSS sticky 实现）、copy CSV（构造 CSV 字符串写 `navigator.clipboard.writeText`）、sticky header class。props 支持 `columnLabels` 与（dataset 模式）meta 脚注 + 粒度按钮组（复用现有 `mosaic-granularity-btn` 样式与交互模式：props `{options, granularity, onGranularity}`）。
6. `FlowDiagramView`：调 `layoutFlowDiagram` 取纯数据 → JSX 生成 `<svg viewBox>`（defs/marker 箭头、先边后节点、`<title>` note tooltip、tspan 折行）；节点类型配色按渲染报告 §5.5（gate 边框用 var(--interactive-accent)）；外层 `figure.mosaic-flow-diagram` + `mosaic-flow-scroll` 横向滚动 + note 段落。
7. `styles.css`：为以上全部 class 新增规则；颜色底色/边框/文字用 Obsidian 变量（--background-primary / --background-modifier-border / --text-normal / --text-muted / --text-faint / --interactive-accent），语义色 hex 按决策记录 4；`.mosaic-block { margin: 18px 0; }`。
8. `npm run build` 通过 → commit：`feat: block view components and styles`。

---

### Task 6（wave 2，依赖 T1-T5）: 集成接线 + DataTable dataset 模式

**Files:** Create `src/blocks/dataset-table.mjs`；Modify `src/dataset/render-chart.tsx`、`src/dataset/chart-tag-processor.tsx`；Test `tests/dataset-table.test.mjs`。

**要求**

1. `dataset-table.mjs`：移植 `datasetQueryFromContent`（解析报告 §7.4 源码逐字，错误文案三条逐字）。测试 ≥5（空 body→{}、query fence 正常、非 query fence 报错、非法 JSON 报错、非对象报错）。
2. `chart-tag-processor.tsx`：改用 `findComponentTags`；fast-path 改为 `/<(DataTable|Timeline|Chart|DecisionBox|MetricGrid|FlowDiagram)/.test(section)`；对 name==="Chart" 走既有 renderChartInto 路径（含 findChartTags 兼容语义——由 processor 对 Chart tag 重新套用 csv fence 校验，不匹配按现状弃候选渲染原文）；其余五类走新分发。
3. `render-chart.tsx` 扩展 `renderComponentInto(plugin, host, sourcePath, {name, attributes, body}, stale)`：
   - 复用 whenHostReady / stale / MarkdownRenderChild 基建（Chart 现路径不动）。
   - 五类分发：try 组件构建（纯函数解析）→ ReactDOM.render 对应 View → catch → `mosaic-error`（`Mosaic: ` + git-leaf 原文）。
   - **dataset 分支**：`attributes.dataset` 存在时——name 非 Chart/DataTable → throw `External datasets support Chart and DataTable.`；DataTable → `loadDatasetForNote` + `datasetQueryFromContent(body)` + `queryDataset({component:"DataTable", manifest, rows, attributes, query, granularity, granularityOptions})` → 把返回的 `rows`/`attributes.columns`/`attributes.columnLabels`/`meta` 注入 DataTableView；粒度按钮组行为对齐 Chart：options = granularityOptions ∩ meta.availableGranularities，切换时以新 granularity 重新 queryDataset（零 IO，数据已在内存）就地重渲；meta 脚注格式复用 Chart 的 buildFootnote 风格（datasetTitle · from → to · granularity · sourceRows/totalRows source rows · data through）。
   - DataTable 渲染前的浅校验（granularity ∈ granularityOptions、granularityOptions 词表）错误文案逐字（解析报告 §2.2）。
4. `npm test && npm run build` 全绿 → commit：`feat: wire five block types through the shared pipeline`（正文列出分发规则与 dataset 语义）。

---

### Task 7（wave 1，可并行）: 文档与测试页

**Files:** Create `docs/data-table.md`、`docs/metric-grid.md`、`docs/timeline.md`、`docs/decision-box.md`、`docs/flow-diagram.md`；Create `test-vault/blocks/`（`data-table.md`、`metric-grid.md`、`timeline.md`、`decision-box.md`、`flow-diagram.md`、`demo.dataset.json`、`demo.csv`）；Modify `README.md`、`docs/mosaic-intro.md`、`docs/mosaic-intro-zh.md`、`docs/dataset-guide.md`（仅状态行）。

**要求**

1. 五篇 docs 照 `docs/chart.md` 体例：引言 blockquote → 写法（成对标签为主，DataTable 另有自闭合 dataset 模式）→ 属性表 → payload 契约（含字段别名表、状态词表）→ **报错示例子章节**（错误框原文逐条 + 「按原文渲染」情形）→ 渲染效果 `![待补充]` → 相关文档互链。内容依据两份研究报告；标注与 git-leaf 的宿主差异（开标签单行、body 无空行、DecisionBox 富文本段落限制）。
2. test-vault/blocks 五页测试文档：每页覆盖正常形态（多状态/多类型枚举全触达）+ 至少 2 条错误路径 + 1 条原文回落路径；FlowDiagram 两种形态各一图（含环退化例）；DataTable 含 inline 表格三格式（csv/json/markdown 表）+ dataset 模式（相对路径引用同目录 demo.dataset.json，月度假数据 6 行）+ query fence 过滤例。全部一眼假数据。
3. README Entries 表 Planned 行改为可用（列五类）；intro 双语 Block Types/Roadmap 状态更新（en 先改 zh 镜像）；dataset-guide「计划中」删除已完成项、正文提及 DataTable 也消费 manifest。
4. commit：`docs: five block types documentation and test pages`。

---

### Task 8（wave 3，依赖全部）: 集成验证 + 收尾

**Files:** 无源码；操作 test-vault。

1. `npm test && npm run build && npm run install:vault`；`obsidian vault=test-vault eval` 重载插件（disable/enable via app.plugins）。
2. 逐页打开 `test-vault/blocks/*.md`，用 eval DOM 断言：每页组件容器数、canvas/table/svg/section 存在性、错误框文案、原文回落；DataTable dataset 页断言表头=columnLabels、粒度按钮组存在且点击后行数变化（eval 触发 click）。
3. 回归 `test-vault/charts/统一入口验证.md` 七场景 DOM 断言（Chart 零回归）。
4. 把验证脚本沉淀为 `test-vault/verify.md`（人读清单）——列出每页应看到什么，供 USER 晨检。
5. 汇报：branch、commit 清单、验证矩阵结果。

## Self-Review 记录

- 契约覆盖：五类组件的解析（T1/T2）、识别（T4）、呈现（T5）、集成与 dataset（T6）、文档测试（T7）、验证（T8）各有归属；研究报告的陷阱清单（columnLabels 属性无效、dataset 与 inline 互斥、fence 语言标签退化、FlowDiagram 隐式边叠加、DecisionBox 永不报错、Timeline 文案偏差保留）分别落在 T1/T4/T6/T7 的要求里。
- 接口一致性：payload/flow/table/dataset-table 的导出签名在「接口契约」一节定死，T5/T6 按此书写；wave 1 并行的依赖风险（T2 依赖 T1 的 extractRows）已注明处理方式。
- No placeholders：逐字移植类任务以上游源文件为唯一真源（路径已给），非移植类给出了结构/常量/词表；文档任务给出体例与内容来源。
