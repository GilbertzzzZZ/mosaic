# DataTable

> DataTable 内容块的使用指导（how）：内联表格（CSV / JSON / Markdown 表）与外部数据集（`.dataset.json`）两种数据来源，共用一套渲染。
> 两种物理写法：标签（成对标签为主，自闭合标签仅在 dataset 模式下才有意义）与 ```` ```datatable ```` 代码块。同一套属性契约，渲染结果完全一致。
> 标签写法通则见 [tag-syntax.md](tag-syntax.md)；布局算法与双数据源的设计动机见 [design/data-table.md](../design/data-table.md)。

## 写法

**成对标签 · 内联数据**（主要形式）：属性写在开标签上，payload 写在标签体内。

````text
<DataTable title="示例明细" columns="item,amount,note">
```csv
item,amount,note
sample-a,10,ok
sample-b,5,watch
```
</DataTable>
````

- 写法边界（开标签必须单行、标签体内不能有空行、属性引号形态与 `=` 规则、闭合标签独占一行且大小写敏感）见 [tag-syntax.md](tag-syntax.md)。

**自闭合标签 · dataset 模式**（body 允许为空，因此只有引用外部数据集时才常见）：

```text
<DataTable
  dataset="demo.dataset.json"
  columns="AnchorDate,营收"
  granularity="month"
  granularityOptions="month,quarter"
/>
```

- 五类组件的标签解析都支持自闭合语法，但 DataTable 之外的四类（MetricGrid / Timeline / DecisionBox / FlowDiagram）没有 payload 就没有数据可渲染——自闭合写它们要么直接报空数据错误，要么（仅 DecisionBox）渲染出一个空壳，通常没有实际意义。

**代码块 · 内联数据**：属性写进 `---` 属性区（扁平 `key: value`，一行一个，值可用引号包裹，`#` 开头是注释），payload 紧跟在闭合的 `---` 之后。

````text
```datatable
---
title: "示例明细"
columns: "item,amount,note"
---
item,amount,note
sample-a,10,ok
sample-b,5,watch
```
````

**代码块 · dataset 模式**：只写属性区，不写 payload。

````text
```datatable
---
dataset: "demo.dataset.json"
columns: "AnchorDate,营收"
granularity: month
granularityOptions: "month,quarter"
---
```
````

- **payload 裸写，不要再套一层围栏。** 成对标签的 payload 要写在 ` ```csv ` 围栏里，代码块的不用——payload 已经在代码块里了。真写了同长度的内层围栏，宿主会把它当成外层围栏的闭合，代码块在那一行就被截断。
- `---` 的开头与闭合是硬边界，缺一个整块报错；属性行本身则宽容——写歪的行被跳过，表照常渲染，底部提示条点名跳过了哪几条。只有一条属性都读不出来时才整块退回。
- 属性名与语义和写在哪里无关：下面这张表对两种写法同时成立。

## 属性表

| 属性 | 说明 | 默认值 |
| --- | --- | --- |
| `title` | 表格标题，渲染在区块头部（与另外四类同一个位置，切原文时不会跟着消失） | 无标题则不渲染 |
| `columns` | 逗号分隔的列名列表，覆盖自动推断的列顺序 | 未设置时 = 所有行 key 的并集，按首次出现顺序 |
| `dataset` | 外部 `.dataset.json` manifest 的相对路径，出现即切换到 dataset 模式 | 无 |
| `granularity` | dataset 模式下的展示粒度 | `auto` |
| `granularityOptions` | dataset 模式下允许的粒度集合，逗号分隔，每项须 ∈ `day/week/month/quarter` | `day,week,month,quarter` |
| `from` / `to` | dataset 模式下的日期范围闭区间 | 无 |

**滚动与固定**（默认行为，没有开关）：表格框体最高约 26 行（表头 1 行 + 数据 25 行），超出的部分在框内上下滚动；列太宽时框内左右滚动。**滚动过程中表头与首列始终钉住**——纵滚时表头不动，横滚时首列不动，两者相交的左上角那一格两个方向都不动。行数少的表根本不会滚，是同一条规则在不同内容量下的自然结果。

> **一张 DataTable 只有一套呈现，与它多大无关。** 曾经有一层「复杂度自动判定」：行数或列数过了阈值就自动长出过滤框、冻结首列勾选框、Copy CSV 按钮和表头吸顶，并有 `complexity` / `search` / `freeze` / `copyCsv` / `sticky` 五个属性可以覆盖。整套已删除——触发线是数据的物理尺寸，与「这张表需不需要这些功能」毫无关系，结果是同样写 `<DataTable>`，读者会看到两种不同的组件。
>
> 唯一保留的自动行为是**布局宽度**（`fit` / `wrap` / `scroll`），那是同样的内容在不同容器宽度下的摆放，不是功能差异。

**`columnLabels` 陷阱**：DataTable 支持一个「列显示名映射」概念，但它**只能通过 dataset 查询结果自动生成**（取 manifest 里每个字段的 `label`），**不能**当作标签属性直接写。标签属性解析永远产出字符串，`columnLabels="..."` 无论写什么都会被判定「不是对象」而静默忽略，表头依旧显示原始列名。想要自定义表头文案，请在 manifest 的 `fields[].label` 里声明（见 [dataset-guide.md](dataset-guide.md)），而不是在标签上加这个属性。

## Payload 契约

**内联模式**（无 `dataset` 属性时）：标签体走[通用行提取四路径](tag-syntax.md#通用行提取四路径)。DataTable 特有的两条规则：

- **不对字段名做别名归一化**：列名就是原始 key（除非 `columns` 属性重排/裁剪）。
- **数字嗅探**：只有严格匹配 `^-?\d+(?:\.\d+)?$`（纯整数或小数）的单元格会转成数字，其余（含空字符串、日期、`"12%"`、`"1,234"`）保持字符串原样展示。

**dataset 模式**（有 `dataset` 属性时）：**与内联 payload 完全互斥**。行数据 100% 来自外部 manifest + 数据文件，**body 必须为空**，时间范围写成 `from` / `to` 属性：

````text
<DataTable dataset="demo.dataset.json" columns="AnchorDate,营收" from="2025-01-01" to="2025-06-01" />
````

代码块写法一字不差，同样 body 为空：

````text
```datatable
---
dataset: "demo.dataset.json"
columns: "AnchorDate,营收"
from: "2025-01-01"
to: "2025-06-01"
---
```
````

> **body 里曾经可以写一个 ` ```query ` 围栏**（JSON 对象，含 `from` / `to` / `where`）。已移除：`where`（按字段过滤）是它唯一能表达而属性表达不了的东西，而全仓扫描下来真实笔记里一次都没用过；围栏本身还写不进代码块——同长度的内层围栏会把外层关掉——白白让 DataTable 的两种写法不等价。真需要按字段过滤时，加一个属性即可，不必重开一套 body 语法。

粒度按钮组、溯源脚注（数据集标题 · 生效窗口 · 粒度 · N/M source rows · data through）、时间对齐校验、`rollup` 语义与 dataset manifest 契约本身，与 Chart 完全一致，见 [dataset-guide.md](dataset-guide.md)。唯一的差异：Chart 会因为「图表可读密度上限 120 点」剔除过密的粒度选项，DataTable **不受此限制**，所有安全粗化后的粒度都保留在候选集合里。

### 报错示例

红色错误框（就地透出根因，前缀均为 `Mosaic: `）：

```text
内联 payload 为空或列集合为空
→ Mosaic: DataTable requires CSV, JSON, or a Markdown table.

dataset 模式的 body 非空（互斥冲突，写什么都一样）
→ Mosaic: Provide either dataset= or an inline body, not both.

dataset 属性值为空字符串
→ Mosaic: dataset must point to a .dataset.json manifest.

granularity 不在 granularityOptions 展开的集合里
→ Mosaic: granularity must be included in granularityOptions.

granularityOptions 出现 day/week/month/quarter 之外的值
→ Mosaic: granularityOptions supports day, week, month, and quarter.
```

dataset 模式下更深层的查询报错（时间对齐、粒度粗化、`where` 校验、`rollup` 缺失等）与 Chart 共用同一套查询语义，完整列表见 [dataset-guide.md](dataset-guide.md) 排错清单。

按原文渲染（不接管、不是错误框）的情形对全部标签组件一致，见 [tag-syntax.md](tag-syntax.md#按原文渲染的通用情形)。

## 渲染效果

> 示例截图一律使用模拟假数据（dark 主题实拍）。三种内联 payload（CSV / JSON / Markdown 表格）渲染效果一致，不分开截图。

上：内联 CSV；下：dataset 模式（month/quarter 粒度按钮组，表头显示 manifest label）。**截图待重拍**——上半张里的工具栏（搜索 / 冻结首列 / 复制 CSV）已经删除，现在两种模式的表格本体一模一样，只有 dataset 模式多一组粒度按钮和一行脚注：

![DataTable inline and dataset modes](../_assets/data-table.png)

## 相关文档

- [tag-syntax.md](tag-syntax.md)——标签写法通则与通用行提取规则
- [dataset-guide.md](dataset-guide.md)——dataset 模式共用的 manifest 契约、查询语义、排错清单
- [chart.md](chart.md)——Chart 内容块，dataset 模式的姊妹实现
- [design/data-table.md](../design/data-table.md)——布局算法与双数据源设计动机
- [mosaic-intro.md](../mosaic-intro.md)——整体定位与 Roadmap
