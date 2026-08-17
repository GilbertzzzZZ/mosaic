# 标签写法通则

<p align="center"><a href="tag-syntax.md">English</a> | <b>简体中文</b></p>

> 六类内容块标签入口（Chart / DataTable / MetricGrid / Timeline / DecisionBox / FlowDiagram）共用的写法规则：宿主段落规则、属性语法、标签体边界、通用行提取路径与「按原文渲染」情形。
> 本文只讲跨组件一致的通则；各组件的属性表、字段契约与特有差异见各自的指导文档，设计动机见 [architecture.md](../design/architecture.md)。

## 宿主段落规则

- 标签写法仅接管「整段只有标签与空白」的段落：段落里混有标签以外的内容时，整段保持 Markdown 原样渲染（不接管，不是错误）。
- 同一段落里的多个标签依次各自渲染、独立报错，一处失败不影响同页其他内容。

## 写法边界

- **开标签必须单行**：只有「完整的开标签独占一行」才会触发 Obsidian 的 HTML block 规则，把标签体连同围栏整体交给插件；开标签换行会被当作普通段落，标签不会被接管，按原文渲染。这是 Obsidian 宿主的段落切分规则决定的，不支持开标签跨多行。
- **标签体内不能有空行**：开标签到闭标签之间一旦出现空行，Obsidian 会提前结束当前 HTML block，后续内容（含围栏和闭标签）被当作独立段落解析，标签同样不会被接管。
- **属性值三种引号形态**：双引号、单引号或不加引号均合法（`title="示例"`、`title='示例'`、`title=示例`）；不加引号时值不能含空白、引号或 `>`、`/`。
- **`=` 两侧有空格时该属性不认，但标签照常接管**：`title = "示例"` 里的 `title`、`=`、`"示例"` 被拆成三段认不出的文本，图/表**照常渲染**（只是没有标题），三段原样列进底部提示条。CommonMark 允许属性名与 `=` 之间有空白，宿主放行，拦不住它。
- **属性名必须是 ASCII**（`[A-Za-z_][A-Za-z0-9_-]*`）：写 `零售业务Label="零售业务"` 或 `CaféLabel="Café"`，**整个标签不被接管**，段落按原文渲染。原因同样在宿主——HTML 属性名不允许非 ASCII，开标签在 CommonMark 那一关就不成立，开标签、围栏、闭标签被切成三个独立段落，插件拿不到完整标签。需要非 ASCII 属性名请改用代码块写法，frontmatter 不受这条限制。
- **闭合标签必须独占一行**、与开标签同名，大小写敏感（如 `</DataTable>`）。

属性语法（引号形态、`=` 规则）对自闭合标签与成对标签同样适用；标签体规则（单行开标签、无空行、闭合标签）仅约束成对标签。

## 通用行提取四路径

DataTable / MetricGrid / Timeline / DecisionBox / FlowDiagram 的内联 payload 共用同一套行提取规则，依次尝试四条路径（Chart 的成对标签标签体只接受 CSV 围栏，不走这套规则，见 [chart.md](chart-zh.md)）：

1. 标签体是一个唯一的围栏代码块（` ```json ` / ` ```tsv ` / ` ```csv ` 或缺省语言标签）：`json` 按 JSON 解析（数组本身即行数组，或 `{"rows":[...]}` 对象）；`tsv` 按 Tab 分隔；**其余任何语言标签（含拼写错误、`csv`、缺省、甚至无关标签）一律退化按逗号 CSV 解析**——语言标签只在 `json`/`tsv` 时真正生效。
2. 无围栏、裸文本以 `[` 或 `{` 开头：整体当 JSON 解析。
3. 无围栏、裸文本含 `|` 字符：当 Markdown 表格解析（第 1 行表头，第 2 行分隔行被无条件跳过不校验格式，第 3 行起是数据）。
4. 兜底：裸文本按逗号 CSV 解析。

提取出的每行是一个扁平对象，字段名 = 列头（CSV/TSV/Markdown 表）或 JSON key；提取之后各组件再做各自的字段别名归一化（或不做，如 DataTable），见各篇 Payload 契约。

**畸形 JSON 报错**：`json` 围栏（或裸 JSON）内容不合法时，直接透出原生 JSON 解析错误（红色错误框，文案随具体错误位置变化）；这条路径对五类组件一致。

## 按原文渲染的通用情形

以下情形标签不被接管，段落按 Markdown 原文渲染（不是错误框），对全部成对标签组件一致：

- 开标签跨多行（见上文写法边界）。
- 标签体内出现空行。
- 段落里混有标签以外的内容。
- 找不到独占一行的闭合标签。

## 相关文档

- [chart.md](chart-zh.md) · [data-table.md](data-table-zh.md) · [metric-grid.md](metric-grid-zh.md) · [timeline.md](timeline-zh.md) · [decision-box.md](decision-box-zh.md) · [flow-diagram.md](flow-diagram-zh.md)——各组件的属性表、契约与特有差异
- [architecture.md](../design/architecture.md)——入口识别与错误处理的设计动机
