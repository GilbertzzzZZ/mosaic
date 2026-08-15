# Chart

> Chart 内容块的使用指导（how）：一种图表，三种写法——自闭合标签、成对标签、代码块。
> 三种写法共用同一套属性契约（见下文[属性表](#属性表)），同一属性无论写成哪种形态，渲染结果完全一致。
> 标签写法通则见 [tag-syntax.md](tag-syntax.md)；写法分裂与类型体系的设计动机见 [design/chart.md](../design/chart.md)；外部数据集契约见 [dataset-guide.md](dataset-guide.md)。

## 三种写法一览

| 写法 | 形态 | 数据来源 | 适用场景 |
| --- | --- | --- | --- |
| 自闭合标签 | `<Chart ... />` | 外部数据集（`.dataset.json`） | 长期维护的报告，数据留在外部文件 |
| 成对标签 | `<Chart ...>` + 围栏 CSV + `</Chart>` | 内联 CSV | 小数据量、一次性的快照内容 |
| 代码块 | ```` ```chartview ```` + `---` frontmatter | 外部数据集或内联 CSV 均可 | 两种模式通吃；需要非 ASCII 属性名时的唯一选择 |

**共同规则**

- 属性契约与展示语义见下文[属性表](#属性表)与[类型映射与展示语义](#类型映射与展示语义)，三种写法完全一致。
- 标签写法的宿主段落规则与属性语法（`=` 两侧无空格、引号形态、混排不接管等）见 [tag-syntax.md](tag-syntax.md)。
- 仅阅读视图；Live Preview（计划中）。

**内联模式（成对标签与代码块 CSV 共用的边界）**

- 不支持 `dataset` / `from` / `to` / `granularity` / `granularityOptions`——这些属于外部数据集语义。
- `x` 缺省取 CSV 首列；显式声明的列必须存在于 CSV 表头。
- 数值列必须是数字或留空，留空表示断点；不合法时报错并给出行号。
- 无溯源脚注、无粒度切换按钮。

---

## 属性表

三个入口共用的契约；标签写法一行一个属性、属性值双引号，代码块写法为 frontmatter 的 `key: value`。

| 属性 | 说明 |
| --- | --- |
| `dataset` | manifest 路径，相对当前笔记所在目录，须以 `.dataset.json` 结尾，不可越出库根 |
| `type` | `line` / `bar` / `grouped-bar` / `stacked-bar` / `combo` / `combo-dual-axis`；缺省时多系列取 line、单系列取 bar |
| `x` | X 轴字段；外部数据集模式须为 manifest 时间字段名或字面量 `period`，内联模式缺省取 CSV 首列 |
| `series`（别名 `y`） | 逗号分隔的系列字段；未声明时回退到全部带 rollup 的数值字段（内联模式回退到首列以外的全部列） |
| `lines` / `bars`（别名 `line` / `bar`） | combo 系列的角色划分；均未写时首个系列为 bar、其余为 line |
| `from` / `to` | 闭区间端点，`YYYY-MM-DD`，须对齐源周期起点（仅外部数据集模式） |
| `granularity` | 展示粒度，缺省 `auto`（取可用集合中最细）；大小写不敏感（仅外部数据集模式） |
| `granularityOptions` | 逗号分隔的候选粒度，渲染为切换按钮组；缺省全四种（仅外部数据集模式） |
| `unit` | 轴单位；`%` 时数值带后缀，`元/¥/cny/rmb/人民币` 前缀 `¥`、`$/usd/美元/美金` 前缀 `$`，其余只画在轴标题 |
| `leftUnit` / `rightUnit` | `combo-dual-axis` 左右轴单位，独立套用上述规则 |
| `labels` | 数值标签开关；`0/false/hide/hidden/no/none/off` 之一时关闭，缺省开启 |
| `title` / `note` | 图表标题与口径说明，渲染在 figure 头部/底部 |
| `<字段名>Label` / `<字段名>Color` | 单系列显示名与颜色（合法 hex）；Label 缺省取 manifest 的 `label`，颜色缺省 6 色板按显示序循环 |

`dataset` / `from` / `to` / `granularity` / `granularityOptions` 属于外部数据集语义，内联模式（成对标签、代码块内联 CSV）不支持，见上文[内联模式边界](#三种写法一览)；manifest 契约与查询语义见 [dataset-guide.md](dataset-guide.md)。

## 类型映射与展示语义

- `combo`：单一刻度语义——左右轴钉同 `min:0/max`；图例顺序跟随标签书写顺序（`lines` 写在 `bars` 前则线系列在前）。
- `combo-dual-axis`：左右轴独立，bars 固定挂左轴。
- 所有图 Y 轴上限自动加 8% 头部空间（stacked-bar 按每期堆叠和计）。
- 折线节点为实心圆点；数值标签统一千分位 + 最多 2 位小数；标签防碰撞——放得下就显示，放不下就隐藏。
- 方块图例；图表跟随 Obsidian 明暗主题，切换主题即时就地换肤；figure 带主题色淡边框。

**溯源脚注**（仅外部数据集模式）：每张图底部自动生成 `数据集标题 · from → to · 粒度 · N/M source rows · data through 日期`；区间内有不完整/缺失周期时追加警告行。

---

## 自闭合标签

面向长期维护的报告场景：数据留在外部文件，正文只声明「看哪一段、按什么粒度看」；源文件零改动即可渲染。

**写法**：自闭合、一行一个属性、属性值双引号：

```text
<Chart
  title="示例趋势"
  dataset="data/schema/example.dataset.json"
  type="combo"
  x="period"
  lines="总量"
  bars="分项A,分项B"
  unit="件"
  labels="all"
  from="2025-01-01"
  to="2025-12-01"
  granularity="month"
  granularityOptions="month,quarter"
  note="口径说明写这里。"
/>
```

- `dataset` 路径相对当前笔记所在目录解析，须以 `.dataset.json` 结尾。
- 展示细节：title / 粒度按钮组 / note / 溯源脚注与不完整周期警告（见上文[类型映射与展示语义](#类型映射与展示语义)）。

### 报错示例（自闭合标签）

红色错误框（就地透出根因）：

```text
<Chart dataset="不存在的路径.dataset.json" type="line" x="period" />
→ Mosaic: Dataset manifest not found in vault: ...

<Chart title="缺数据来源" type="line" x="period" />
→ Mosaic: Chart needs dataset= or an inline CSV body.

<Chart dataset="..." from="2025-01-15" ... />（月度源，from 未对齐月初）
→ Mosaic: Dataset query from must identify a month source period start.

<Chart dataset="..." granularity="week" granularityOptions="month,quarter" ... />
→ Mosaic: Granularity "week" is not in granularityOptions (month,quarter).
```

按原文渲染（不接管、不是错误框）：

- 属性值内出现字面 `/>`（提前截断，安全拒绝）。
- 属性值内含 `>` 时须用双引号包裹；单引号内的 `>` 不被识别（标签在 `>` 处提前结束），整个标签回退为原文。
- 属性名含非 ASCII 字符（如中文字段名的 `<字段名>Label` / `<字段名>Color`）——整个标签弃候选；此类属性请改用代码块写法（frontmatter 支持非 ASCII key）。
- 段落里混有标签以外的内容（通用情形，见 [tag-syntax.md](tag-syntax.md#按原文渲染的通用情形)）。

---

## 成对标签

面向小数据量、一次性的内容：数据直接内联在正文里，不依赖外部文件。

**写法**：属性写在开标签且**开标签必须写在同一行**，CSV 用围栏块内嵌于标签体，语言标注 `csv` 可省略：

````text
<Chart title="示例" type="combo" x="month" bars="指标A" lines="指标B" labels="all">
```csv
month,指标A,指标B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
</Chart>
````

- 开标签必须单行、标签体内不能有空行等写法边界见 [tag-syntax.md](tag-syntax.md)（自闭合标签不受标签体规则限制，因为标签体内没有围栏）。属性多到想换行时，改用代码块写法——frontmatter 天然一行一个属性。
- 开标签到闭标签之间必须是「可选空白 + CSV 围栏 + 可选空白」——Chart 标签体只接受 CSV 围栏，不走五类标签组件的通用行提取路径。
- 内联模式的通用边界见[本文开头](#三种写法一览)。

### 报错示例（成对标签）

红色错误框：

````text
granularity="month" 等外部数据集属性用于内联数据
→ Mosaic: Inline data does not support the "granularity" attribute (dataset charts only).

series="不存在的列"
→ Mosaic: Inline CSV has no "不存在的列" column.

数值列写了非数字（如 2025-01,abc）
→ Mosaic: Inline CSV row 2: "指标A" value "abc" is not a number.

开标签写了 dataset="..." 同时标签体又带 CSV
→ Mosaic: Provide either dataset= or an inline CSV body, not both.
````

按原文渲染（不接管、不是错误框）：

- 标签体没有 CSV 围栏（裸文本 CSV 不识别，Chart 特有）。
- 标签体内出现空行、缺少 `</Chart>` 闭标签、段落混排等通用情形，见 [tag-syntax.md](tag-syntax.md#按原文渲染的通用情形)。

---

## 代码块

`chartview` 代码块：`---` frontmatter 属性区 + 可选内联 CSV 数据区，两种模式通吃。frontmatter 为扁平 `key: value`，一行一个；值可用引号包裹；`#` 开头的行是注释；不支持嵌套结构——这是声明式契约，不是图表库配置透传。

**写法一：引用外部数据集（只写 frontmatter）**，语义与自闭合标签的 `dataset` 模式完全一致：

````text
```chartview
---
title: "示例趋势"
dataset: "data/schema/example.dataset.json"
type: combo
x: period
lines: 总量
bars: "指标A,指标B"
unit: 件
granularityOptions: "month,quarter"
---
```
````

**写法二：内联 CSV（frontmatter + 数据区）**，去掉 `dataset`，`---` 之后紧跟 CSV：

````text
```chartview
---
title: "示例趋势"
type: line
series: "指标A,指标B"
unit: 件
---
month,指标A,指标B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
````

### 报错示例（代码块）

代码块一旦声明为 `chartview` 就必定被接管，所有错误都以红色错误框呈现（没有原文回落）：

````text
缺少 "---" 开头的属性区
→ Mosaic: chartview block must start with a "---" attribute section (see docs/chart.md).

属性区没有闭合的 "---"
→ Mosaic: chartview attribute section is missing its closing "---".

属性行缩进（试图写嵌套结构）
→ Mosaic: Attribute lines must not be indented (flat key: value only): ...

key 后面没有值
→ Mosaic: Attribute "labels" has no value (nested values are not supported).

frontmatter 有 dataset 同时又带 CSV 数据区
→ Mosaic: Provide either dataset= or an inline CSV body, not both.

既没有 dataset 也没有 CSV 数据区
→ Mosaic: Chart needs dataset= or an inline CSV body.
````

内联数据区的报错（禁用属性、非法数值、列不存在）与成对标签完全一致，见[上一节](#报错示例成对标签)。

---

## 渲染效果

> 示例截图一律使用模拟假数据（dark 主题实拍）。三种写法效果一致，不分开截图。

**内联 CSV · combo 图**（成对标签写法，数值标签含首尾）：

![Inline combo chart](../_assets/readme-chart.png)

**外部数据集 · combo-dual-axis**（粒度切换按钮组、`$`/`%` 单位格式化、千分位、note 与溯源脚注）：

![Dataset dual-axis chart](../_assets/chart-dataset.png)

**错误框呈现**（manifest 路径不存在时就地报错，不影响同页其他内容）：

![Chart error box](../_assets/chart-error.png)

---

## 相关文档

- [tag-syntax.md](tag-syntax.md)——标签写法通则（宿主段落规则、属性语法、按原文渲染情形）
- [dataset-guide.md](dataset-guide.md)——manifest 契约、查询语义、排错清单
- [design/chart.md](../design/chart.md)——写法分裂、类型体系与格式化体系的设计动机
- [mosaic-intro.md](../mosaic-intro.md)——整体定位与 Roadmap（DataTable / MetricGrid / Timeline / DecisionBox / FlowDiagram 及更多内容块类型规划）
