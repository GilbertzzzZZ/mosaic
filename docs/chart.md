# Chart

> Chart 内容块的完整文档：一种图表，三种写法——自闭合标签、成对标签、代码块。
> 三种写法共用同一套属性契约（见 [[docs/dataset-guide|dataset-guide.md]] 属性表），同一属性无论写成哪种形态，渲染结果完全一致。

## 三种写法一览

| 写法 | 形态 | 数据来源 | 适用场景 |
| --- | --- | --- | --- |
| 自闭合标签 | `<Chart ... />` | 外部数据集（`.dataset.json`） | 长期维护的报告，数据留在外部文件 |
| 成对标签 | `<Chart ...>` + 围栏 CSV + `</Chart>` | 内联 CSV | 小数据量、一次性的快照内容 |
| 代码块 | ```` ```chartview ```` + `---` frontmatter | 外部数据集或内联 CSV 均可 | 两种模式通吃；需要非 ASCII 属性名时的唯一选择 |

**共同规则**

- 属性契约、类型映射（`line` / `bar` / `grouped-bar` / `stacked-bar` / `combo` / `combo-dual-axis`）与展示语义见 [[docs/dataset-guide|dataset-guide.md]]，本文不重复。
- 标签写法仅接管「整段只有标签与空白」的段落，混排段落保持原样；每个图表独立渲染与报错，一处失败不影响同页其他内容。
- 数值格式化、单位前缀/后缀、Y 轴 8% 留白、方块图例、Obsidian 明暗主题跟随，三种写法完全一致。
- 仅阅读视图；Live Preview（计划中）。

**内联模式（成对标签与代码块 CSV 共用的边界）**

- 不支持 `dataset` / `from` / `to` / `granularity` / `granularityOptions`——这些属于外部数据集语义。
- `x` 缺省取 CSV 首列；显式声明的列必须存在于 CSV 表头。
- 数值列必须是数字或留空，留空表示断点；不合法时报错并给出行号。
- 无溯源脚注、无粒度切换按钮。

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
- 展示细节：title / 粒度按钮组 / note / 溯源脚注（数据集标题 · 生效窗口 · N/M source rows · data through）与不完整周期警告。

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
- 属性名含非 ASCII 字符（如中文字段名的 `<字段名>Label` / `<字段名>Color`）——整个标签弃候选；此类属性请改用代码块写法（frontmatter 支持非 ASCII key）。
- 段落里混有标签以外的内容。

---

## 成对标签

面向小数据量、一次性的内容：数据直接内联在正文里，不依赖外部文件。

**写法**：属性写在开标签（一行一个属性，与自闭合同风格），CSV 用围栏块内嵌于标签体，语言标注 `csv` 可省略：

````text
<Chart
  title="示例"
  type="line"
  x="month"
  series="指标A,指标B"
  unit="件"
>
```csv
month,指标A,指标B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
</Chart>
````

- 标签体内不能有空行；开标签到闭标签之间必须是「可选空白 + CSV 围栏 + 可选空白」。
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

- 标签体没有 CSV 围栏（裸文本 CSV 不识别）。
- 标签体内出现空行、或缺少 `</Chart>` 闭标签。
- 段落里混有标签以外的内容。

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

> 图片均为待补充占位；示例截图一律使用明显的假数据。三种写法效果一致，不分开截图。

- 折线 / 柱状 / 堆叠 / 组合图：![待补充]
- 粒度切换按钮组（仅外部数据集模式）：![待补充]
- 单位与格式化（`%` 后缀、货币前缀、千分位）：![待补充]
- 明暗主题跟随：![待补充]
- 溯源脚注与不完整周期警告（仅外部数据集模式）：![待补充]
- 错误框呈现：![待补充]

---

## 相关文档

- [[docs/dataset-guide|dataset-guide.md]]——属性表、manifest 契约、查询语义、排错清单
- [[docs/mosaic-intro|mosaic-intro.md]]——整体定位与 Roadmap（MetricGrid / DataTable / Card 等其他内容块类型规划）
