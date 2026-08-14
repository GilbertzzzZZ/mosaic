# 外部数据集渲染指导

> Mosaic 的 Chart 标签如何读取外部数据集出图：标签写法、manifest 契约、查询语义、展示细节与排错清单。
> 本文的属性表是自闭合标签、成对标签、代码块三个入口共用的契约，同一属性在任一入口写法一致。
> DataTable 的 dataset 模式复用同一套 manifest 契约与查询语义（`from`/`to`/`granularity`/`granularityOptions`、粒度切换按钮、溯源脚注均一致），本文的 manifest 契约与排错清单同样适用于 DataTable，见 [[docs/data-table|data-table.md]]。

## 架构总览

> 三段式管线：多入口识别 → 各入口解析处理 → 特定的渲染。

**数据流**

```
<Chart ... /> 标签（md/mdx 正文）
  → 识别：post-processor 读取段落源文本，命中自闭合 Chart 标签
  → 解析：加载 manifest 与数据文件 → 区间过滤、粒度上卷 → 生成 AntV 配置
  → 渲染：ChartFigure（标题/粒度切换/note/脚注）包裹 AntV 图表组件
```

**接管规则**

- 仅当段落除 `<Chart ... />` 标签与空白外没有其他内容时才接管渲染；混排段落保持 Obsidian 原样输出。
- 每个标签独立渲染与报错：一个标签失败只在原位显示错误框，不影响同页其他内容。
- 渲染发生在阅读视图（reading view）；Live Preview 支持（计划中）。

---

## Chart 标签写法

**基本形态**（自闭合，一行一个属性，属性值双引号）

```text
<Chart
  title="活跃付费率趋势"
  dataset="data/metrics/monthly-active-paid-rate.dataset.json"
  type="line"
  x="period"
  series="活跃付费率,钢琴,小提琴"
  unit="%"
  labels="all"
  from="2024-07-01"
  to="2026-07-01"
  granularity="month"
  granularityOptions="month,quarter"
  note="活跃付费率 = 付费用户 / 活跃用户；季度视图为月比率的算术平均。"
/>
```

**属性表**

| 属性 | 说明 |
| --- | --- |
| `dataset` | manifest 路径，相对当前笔记所在目录，须以 `.dataset.json` 结尾，不可越出库根 |
| `type` | `line` / `bar` / `grouped-bar` / `stacked-bar` / `combo` / `combo-dual-axis`；缺省时多系列取 line、单系列取 bar |
| `x` | X 轴字段，须为 manifest 时间字段名或字面量 `period` |
| `series`（别名 `y`） | 逗号分隔的系列字段；未声明时回退到全部带 rollup 的数值字段 |
| `lines` / `bars`（别名 `line` / `bar`） | combo 系列的角色划分；均未写时首个系列为 bar、其余为 line |
| `from` / `to` | 闭区间端点，`YYYY-MM-DD`，须对齐源周期起点 |
| `granularity` | 展示粒度，缺省 `auto`（取可用集合中最细）；大小写不敏感 |
| `granularityOptions` | 逗号分隔的候选粒度，渲染为切换按钮组；缺省全四种 |
| `unit` | 轴单位；`%` 时数值带后缀，`元/¥/cny/rmb/人民币` 前缀 `¥`、`$/usd/美元/美金` 前缀 `$`，其余只画在轴标题 |
| `leftUnit` / `rightUnit` | `combo-dual-axis` 左右轴单位，独立套用上述规则 |
| `labels` | 数值标签开关；`0/false/hide/hidden/no/none/off` 之一时关闭，缺省开启 |
| `title` / `note` | 图表标题与口径说明，渲染在 figure 头部/底部 |
| `<字段名>Label` / `<字段名>Color` | 单系列显示名与颜色（合法 hex）；Label 缺省取 manifest 的 `label`，颜色缺省 6 色板按显示序循环 |

**类型映射与展示语义**

- `combo`：单一刻度语义——左右轴钉同 `min:0/max`；图例顺序跟随标签书写顺序（`lines` 写在 `bars` 前则线系列在前）。
- `combo-dual-axis`：左右轴独立，bars 固定挂左轴。
- 所有图 Y 轴上限自动加 8% 头部空间（stacked-bar 按每期堆叠和计）。
- 折线节点为实心圆点；数值标签统一千分位 + 最多 2 位小数；标签防碰撞——放得下就显示，放不下就隐藏。
- 图表跟随 Obsidian 明暗主题，切换主题即时就地换肤；figure 带主题色淡边框。

**溯源脚注**：每张图底部自动生成 `数据集标题 · from → to · 粒度 · N/M source rows · data through 日期`；区间内有不完整/缺失周期时追加警告行。

---

## 数据集 manifest 契约

与数据文件同目录的 sidecar，文件名以 `.dataset.json` 结尾：

```json
{
  "schemaVersion": 1,
  "id": "monthly-active-paid-rate",
  "title": "月度活跃付费率",
  "description": "口径说明，取数前先读这里",
  "data": "../monthly-active-paid-rate.csv",
  "format": "csv",
  "grain": ["AnchorDate"],
  "primaryKey": ["AnchorDate"],
  "time": {
    "field": "AnchorDate",
    "type": "date",
    "timezone": "Asia/Shanghai",
    "weekStartsOn": "monday",
    "calendar": "calendar",
    "sourceGranularity": "month"
  },
  "fields": [
    { "name": "AnchorDate", "type": "date", "required": true },
    {
      "name": "活跃付费率",
      "label": "活跃付费率",
      "description": "字段级口径说明",
      "type": "decimal",
      "unit": "%",
      "required": true,
      "rollup": "avg",
      "numberFormat": "comma-grouped"
    }
  ]
}
```

**要点**

- `data` 相对 manifest 所在目录解析；`format` 支持 `csv` / `tsv` / `json`，缺省按扩展名推断。
- `rollup` 决定上卷语义：`sum` / `avg` / `min` / `max` / `count` / `first` / `last`，或 `{ "op": "ratioOfSums", "numerator": "...", "denominator": "...", "scale": 1 }`。无 rollup 的字段只能在源粒度展示。
- 语义提醒：日活按 `avg` 上卷到月是「平均日活」不是「月活」，应写进字段 `description` 并用 `note` 提示读者。
- 脏数据适配：`sourceColumn`（按物理列号取数，一个字段用了全字段都要用）、`numberFormat: "comma-grouped"`（接受 `12,345.67` 千分位）、`skipBlankRows`（非时间字段整行为空则跳过）。
- 体量上限：manifest ≤ 256KB，数据文件 ≤ 20MB，行数 ≤ 25 万。

**时间对齐（最常见的报错来源）**

- 时间字段必须是完整 `YYYY-MM-DD`，且落在源周期起点：月源写当月 1 号，季度源写自然季度首日，周源写 `weekStartsOn` 声明的那天。
- 校验发生在加载阶段，整份文件逐行合规；缩小 `from`/`to` 不能绕开区间外的违规行。
- 粒度只能上卷不能下探：日源可出日/周/月/季度，周源只出周及以上，月源只出月/季度。
- 图表模式下超过 120 个数据桶的粒度会被密度过滤剔除（避免不可读的密集图）。

---

## 排错清单

- **图表位置显示原文**：段落里混有标签以外的内容（不接管，属预期）；或标签未正确自闭合。
- **红色错误框**：读 message——manifest/数据文件找不到（路径相对笔记/相对 manifest 是否写对）、日期未对齐周期起点（含行号）、字段未声明、粒度不在 granularityOptions 内。
- **少一条线**：manifest 不做计算，源数据没有的合计列画不出来；需要合计就在数据文件补列。
- **同一数据要出两种口径**：一个 manifest 只承载一套 rollup；求和图与均值图各写一个 manifest，`data` 指向同一文件。
- **属性值内不能出现字面 `/>`**：会提前截断标签（安全拒绝，显示原文）。
- **提示省略了不完整边界周期**：区间端点未覆盖完整周期，属正常行为；要消除就把端点挪到完整周期边界。

---

## 计划中

- Live Preview 渲染。

---

## 参考

- 契约参照实现：`~/projects/git-leaf`（数据层移植来源，Apache-2.0，见 NOTICE）。
- 生产样本：`~/projects/mango-os/growth/mango-da/data/*/schema/` 的 manifest 与同目录 CSV；`growth/reports/` 下的月报是 Chart 标签的成规模用例。
