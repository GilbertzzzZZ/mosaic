# 自闭合标签（Chart）

> Chart 标签入口的详细介绍：在 md / mdx 正文写一个自闭合 `<Chart ... />`，阅读视图渲染为交互图表。数据集契约与属性明细见 [[docs/dataset-guide|dataset-guide.md]]。

## 定位

- 面向长期维护的报告场景：数据留在外部文件，正文只声明「看哪一段、按什么粒度看」。
- 源文件零改动即可渲染：同一份 md / mdx 在 git-leaf 站点与 Obsidian 中读到一致的图。

## 基本写法

自闭合、一行一个属性、属性值双引号，段落内只放标签本身：

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

完整属性表、类型映射与展示语义见 [[docs/dataset-guide|dataset-guide.md]]，此处不重复。

## 渲染效果

> 图片均为待补充占位；示例截图一律使用明显的假数据。

**折线（line）**

- 实心圆点节点、千分位数值标签、防碰撞布局。
- ![待补充]

**柱状（bar / grouped-bar / stacked-bar）**

- 分组与堆叠两种形态；堆叠图 Y 轴按每期堆叠和留头部空间。
- ![待补充]

**组合图（combo / combo-dual-axis）**

- combo 单一刻度，图例顺序跟随标签书写顺序；dual-axis 左右轴独立、单位分标。
- ![待补充]

**粒度切换**

- `granularityOptions` 渲染为按钮组，切换零 IO 即时重绘。
- ![待补充]

**单位与格式化**

- `%` 后缀、货币符号前缀（¥ / $）、千分位分组。
- ![待补充]

**明暗主题**

- 跟随 Obsidian 主题即时换肤，figure 带主题色淡边框。
- ![待补充]

**口径可见**

- title、note、溯源脚注（数据集标题 · 生效窗口 · N/M source rows · data through）、不完整周期警告。
- ![待补充]

**错误呈现**

- 每个标签独立错误框，透出根因（路径、日期对齐、字段、粒度），不静默、不影响同页其他内容。
- ![待补充]

## 边界与限制

- 仅接管「整段只有标签与空白」的段落；混排段落保持原样。
- 属性值内不能出现字面 `/>`。
- 属性名仅支持 ASCII（`A-Za-z0-9_-`，且以字母或 `_` 开头）；使用中文字段名的 `<字段名>Label` / `<字段名>Color` 属性会让整个标签被弃候选、按原文渲染——此类属性请改用代码块入口（frontmatter 支持非 ASCII key）。
- 仅阅读视图；Live Preview（计划中）。
- 需要内联数据时用成对形态，见 [[docs/paired-tag|paired-tag.md]]。

## 相关文档

- [[docs/dataset-guide|dataset-guide.md]]——manifest 契约、查询语义、排错清单
- [[docs/paired-tag|paired-tag.md]]——成对标签形态，`<Chart>` 内联 CSV 已可用
