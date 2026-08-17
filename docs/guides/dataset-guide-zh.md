# 外部数据集渲染指导

*[English](dataset-guide.md)*

> 外部数据集的使用指导（how）：manifest 契约、查询语义与排错清单——Chart 与 DataTable 的 dataset 模式共用这一套（`from`/`to`/`granularity`/`granularityOptions`、粒度切换按钮、溯源脚注均一致）。
> 本文不含正文侧的标签写法与属性表——Chart 见 [chart.md](chart-zh.md)（属性的单一权威源），DataTable 见 [data-table.md](data-table-zh.md)；契约设计动机见 [design/architecture.md](../design/architecture.md) 的外部数据集子系统一节。

## 在正文中引用

正文标签用 `dataset` 属性指向 manifest（路径相对当前笔记所在目录，须以 `.dataset.json` 结尾），配合 `from`/`to`/`granularity`/`granularityOptions` 声明「看哪一段、按什么粒度看」；完整写法与属性表见 [chart.md](chart-zh.md) 与 [data-table.md](data-table-zh.md)，本文不重复。

**溯源脚注**：每张图/表底部自动生成 `数据集标题 · from → to · 粒度 · N/M source rows · data through 日期`；区间内有不完整/缺失周期时追加警告行。

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
