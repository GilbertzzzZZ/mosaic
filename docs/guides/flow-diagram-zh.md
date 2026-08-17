# FlowDiagram

<p align="center"><a href="flow-diagram.md">English</a> | <b>简体中文</b></p>

> FlowDiagram 内容块的使用指导（how）：分层自动布局的流程图（SVG），两种互斥的 payload 形态——显式 graph JSON，或表格式行数据（`next` 列隐式生成边）。
> 两种物理写法：成对标签与 ```` ```flowdiagram ```` 代码块，同一套属性契约，渲染结果完全一致。
> 只支持内联 payload——不支持 `dataset` 属性，也不支持自闭合标签（body 为空时直接报错）。
> 标签写法通则见 [tag-syntax.md](tag-syntax-zh.md)；分层布局与环退化的设计动机见 [design/flow-diagram.md](../design/flow-diagram.md)。

## 渲染效果

> 示例截图一律使用模拟假数据（dark 主题实拍）。形态 A（graph JSON）与形态 B（表格式行）布局效果一致，不分开截图。
>
> **<待补全>**：全部截图拍摄于 2026-08-15，早于本轮的框体统一改动（六类内容块的边框、圆角、背景合并成一条规则，DataTable 的框从内层上提到外层）。图中的框体样式与当前渲染有出入，待统一重拍。

分层 DAG 布局、六类节点配色、边标签与箭头：

![FlowDiagram layout](../_assets/flow-diagram.png)

## 写法

**形态 A（graph JSON）**：属性写在开标签上，payload 是唯一的 ` ```json ` 围栏，顶层是 `{nodes, edges}` 对象：

````text
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
````

**形态 B（表格式行，回退）**：payload 走通用的行提取规则（CSV/TSV/JSON 数组/裸 Markdown 表都可），每行是一个节点，`next` 列（逗号分隔，可写多个目标 id）隐式生成边——不需要单独写 edges 表：

````text
<FlowDiagram title="示例流程">
```csv
id,label,type,next
a,开始,start,b
b,判断条件,decision,c
c,结束,end,
```
</FlowDiagram>
````

- **两种形态的判定**：标签体是唯一一个语言标签恰为 `json` 的围栏（或裸文本以 `{`/`[` 开头），且解析出的顶层值是非数组对象、`nodes` 字段是数组 → 形态 A；否则一律回退形态 B（走通用行提取）。写 ` ```csv ` 但内容恰好是合法 JSON **不会**被当成图解析，仍按 CSV 处理。
- **两种形态最终汇入同一套归一化**：即使走了形态 A（显式 JSON graph），节点上的 `next`/`to` 字段依然会**再次**被拿去生成隐式边并追加到显式 `edges` 数组后面，两者合并、不去重。所有引用不存在节点 id 的边（无论显式给的还是 `next` 派生的）都被静默过滤掉，不报错。
- 写法边界（开标签必须单行、标签体内不能有空行、属性引号形态与 `=` 规则、闭合标签独占一行且大小写敏感）见 [tag-syntax.md](tag-syntax-zh.md)。

**代码块写法**：属性写进 `---` 属性区（扁平 `key: value`，一行一个，值可用引号包裹，`#` 开头是注释），payload 紧跟在闭合的 `---` 之后。两种形态都写得了——**裸写的 JSON 以 `{` 开头，正好命中形态 A 的判据**：

````text
```flowdiagram
---
title: "示例流程"
---
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
````

形态 B 同样裸写：

````text
```flowdiagram
---
title: "示例流程"
---
id,label,type,next
a,开始,start,b
b,判断条件,decision,c
c,结束,end,
```
````

- **payload 裸写，不要再套一层围栏。** 成对标签的 payload 要写在 ` ```json ` / ` ```csv ` 围栏里，代码块的不用——payload 已经在代码块里了。真写了同长度的内层围栏，宿主会把它当成外层围栏的闭合，代码块在那一行就被截断。
- 少了围栏的语言标签，形态判定改由内容自己说话：以 `{` 开头且顶层 `nodes` 是数组 → 形态 A，否则形态 B。上面两个示例分别命中这两条。
- `---` 的开头与闭合是硬边界，缺一个整块报错；属性行本身则宽容——写歪的行被跳过，流程图照常渲染，底部提示条点名跳过了哪几条。只有一条属性都读不出来时才整块退回。

## 属性表

| 属性 | 说明 |
| --- | --- |
| `title` | 渲染在区块头部（与另外四类同一个位置），同时作为 SVG 的 `aria-label`；未设置时 `aria-label` 缺省为英文 `Flow diagram` |
| `note` | 图下方附注文字 |

FlowDiagram **没有其他属性**——不支持 `dataset`。若在标签上写 `dataset="..."`，会被当作外部数据集组件处理但因不在支持名单内而报错（见下）。

## Payload 契约

**形态 A 顶层结构**：

```json
{
  "nodes": [ { "id": "...", "label": "...", "type": "...", "note": "...", "next": "..." } ],
  "edges": [ { "from": "...", "to": "...", "label": "..." } ]
}
```

`edges` 字段名可以是 `edges` 或 `links`（`edges` 优先）。

**形态 B**：走[通用行提取四路径](tag-syntax-zh.md#通用行提取四路径)。

**节点归一化**（两种形态最终都走这一步）：

| 输出字段 | 别名优先级 |
| --- | --- |
| `id` | `id` ?? `key` ?? 序号（1-based）；trim 后为空的节点被丢弃 |
| `label` | `label` ?? `title` ?? `name` ?? `id` |
| `type` | 见下表 |
| `note` | `note` ?? `description`，渲染为 SVG 原生 hover tooltip |
| `next`（仅用于隐式生成边） | `next` ?? `to`，逗号分隔多个目标 id |

**边归一化**：`from`/`to` 支持别名 `source`/`target`；`label` 支持别名 `title`；引用不存在节点 id 的边被静默过滤。

**type 状态词表**（类型词自动归一化，默认 `action`，支持的词表见下）：

| 归一化结果 | 命中输入 |
| --- | --- |
| `start` | 显式 `start` |
| `end` | 显式 `end` |
| `decision` | 显式 `decision`，或 `question` / `branch` / `condition` |
| `gate` | 显式 `gate` |
| `risk` | 显式 `risk`，或 `warning` / `blocked` / `error` |
| `action`（默认） | 其他任意值或未指定 |

**自动分层布局**：节点按边的 `from→to` 方向做最长路径拓扑分层（同层横向等距排布，层间纵向递增），边用三次贝塞尔曲线连接。**环退化规则**：若图中存在环，环内节点在拓扑遍历中永远不会被访问到；遍历结束后，这些未访问节点按输入顺序依次追加到「当前最深层 +1、+2、+3…」，每个孤立/环内节点单独占一层——即环会被拉直成一条纵向链，不做真正的环形布局。

**环退化最小示例**（伪造数据，`a → b → c → a` 三节点环）：

````text
<FlowDiagram title="示例环（退化布局）">
```csv
id,label,type,next
a,节点A,action,b
b,节点B,action,c
c,节点C,action,a
```
</FlowDiagram>
````

三个节点会被逐一拉开成三层纵向排布，而不是折叠成一个视觉闭环。

**空数据报错**：解析不出任何有效节点时触发（即使 `edges` 有内容，没有一个 id 非空的节点也不够）。

### 报错示例

红色错误框（就地透出根因，前缀均为 `Mosaic: `）：

```text
标签体为空、或形态 A/B 都没有解析出任何有效节点
→ Mosaic: FlowDiagram requires nodes.

标签上出现 dataset 属性（FlowDiagram 不支持外部数据集）
→ Mosaic: External datasets support Chart and DataTable.
```

按原文渲染（不接管、不是错误框）的情形对全部标签组件一致，见 [tag-syntax.md](tag-syntax-zh.md#按原文渲染的通用情形)。

## 相关文档

- [tag-syntax.md](tag-syntax-zh.md)——标签写法通则与通用行提取规则
- [data-table.md](data-table-zh.md)——同样支持多种内联 payload 形态的姊妹组件
- [design/flow-diagram.md](../design/flow-diagram.md)——双形态判定、分层布局与环退化的设计动机
- [mosaic-intro.md](../mosaic-intro.md)——整体定位与 Roadmap
