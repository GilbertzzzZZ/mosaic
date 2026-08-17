# Mosaic

> Mosaic 是 Obsidian 的声明式内容块渲染插件：在 md / mdx 中按约定语法声明内容块，插件识别、解析后渲染为富交互内容。
> 笔记如 mosaic（马赛克拼图）——chart、metric grid、card 一块块内容块，拼合成完整的阅读画面。
> 本文只覆盖定位、内容块全景与 Roadmap；各内容块的使用指导在 `docs/guides/`，设计动机在 `docs/design/`。

## 定位

> 从「图表插件」升级为「通用内容块渲染引擎」，chart 只是第一种内容块类型。

**一句话定位**

- 在纯文本笔记里写声明，得到富交互内容——不改动源文件，不依赖外部站点。

---

## 核心机制

> 三段式管线：多入口识别 → 各入口解析处理 → 特定的渲染。

**识别**

- 扫描 md / mdx 正文，命中约定语法的内容块声明。
- 每种语法是一个独立入口，入口之间互不影响。

**解析**

- 按内容块类型分发到对应解析链：读取声明属性、加载数据、生成渲染配置。
- 解析失败时渲染行内错误提示框，不影响文档其余内容。

**渲染**

- 每种内容块类型有专属渲染组件；图表类基于 Ant Design Charts（AntV）。
- 渲染发生在阅读视图（reading view）；Live Preview 支持见 Roadmap。

---

## 声明语法

> 三种写法，均直接写在 md / mdx 正文中。

- **代码块**——以内容块命名的围栏（`chart`、`datatable`、`timeline`、`metricgrid`、`decisionbox`、`flowdiagram`），`---` frontmatter 属性区 + 可选内联 payload。`chartview` 保留为 `chart` 的别名。
- **自闭合标签**——`<Chart ... />`，一行一个属性，数据来自外部数据集 manifest。
- **成对标签**——属性写在开标签上，数据 payload 写在标签体内。

六类内容块都接受这两种物理形式。入口层只识别形式、不识别别的：两种形式交给解析层的结构完全相同，因此属性契约与写在哪里无关。

标签写法通则（宿主段落规则、属性语法、按原文渲染情形）见 [tag-syntax.md](guides/tag-syntax-zh.md)；三种写法的完整示例见 [chart.md](guides/chart-zh.md)。

---

## 内容块类型

> 六类内容块已可用：Chart、DataTable、MetricGrid、Timeline、DecisionBox、FlowDiagram。

**Chart**

- 折线（line）、柱状（bar）、分组柱状（grouped-bar）、堆叠柱状（stacked-bar）、组合图（combo）与双轴组合图（combo-dual-axis），三个入口共用同一份声明式属性契约驱动出图。
- 数据来自外部数据集 manifest，或直接写在声明体内的内联 CSV。
- 完整属性契约见 [chart.md](guides/chart-zh.md)；数据集 manifest 契约见 [dataset-guide.md](guides/dataset-guide-zh.md)。

**DataTable、MetricGrid、Timeline、DecisionBox、FlowDiagram**

- 成对标签或代码块，两种写法契约一致；`DataTable` 的 dataset 模式另支持自闭合标签。
- `DataTable` 支持内联表格（CSV/JSON/Markdown）与外部数据集 manifest 两种数据来源，与 Chart 共用同一套查询层。外部数据只有 Chart 与 DataTable 支持。
- `MetricGrid`、`Timeline`、`DecisionBox`、`FlowDiagram` 只支持内联 payload，各自有独立的字段别名与状态词表契约。
- `DecisionBox` 是唯一在空/非结构化 payload 时不报错的类型：会回退为一段极简富文本（误用 `dataset` 或畸形 JSON 仍会报错）。
- 完整契约见 [data-table.md](guides/data-table-zh.md)、[metric-grid.md](guides/metric-grid-zh.md)、[timeline.md](guides/timeline-zh.md)、[decision-box.md](guides/decision-box-zh.md)、[flow-diagram.md](guides/flow-diagram-zh.md)。

**更多类型**（规划中）

- 现有类型集是下限而非上限：Mosaic 原创的更多内容块类型将沿同一管线继续扩展。

---

## 数据来源

> 内容块的数据可以内联写成 CSV，也可以来自外部数据集 manifest。

**内联 CSV**

- 数据直接写在声明体内：成对标签体内的 CSV 围栏块，或代码块 `---` 之后的 CSV 数据区。
- 适合小数据量、一次性图表，不依赖外部文件。

**外部数据集（dataset manifest）**

- 数据文件旁放置 `.dataset.json` sidecar manifest，声明指标口径与上卷规则。
- 标签声明时间区间与展示粒度，插件按 manifest 完成区间过滤与粒度上卷。
- 口径信息（label、note、溯源脚注）随图可见。
- 设计细节见 [dataset-guide.md](guides/dataset-guide-zh.md)。

---

## 配套能力

> 降低书写成本的工具与交互。

**安全边界**

- 不执行 SQL、公式求值与脚本。
- 不访问库（vault）外文件，不发起网络请求。

---

## Roadmap

> 已规划、尚未实现的方向为占位；已完成项单独标注。

- （占位）Live Preview 渲染支持。
- （已完成 2026-08-15）DataTable、MetricGrid、Timeline、DecisionBox、FlowDiagram 内容块类型——补齐六类内置内容块。
- （已完成 2026-08-14）插件 id 已迁移为 `mosaic`；市场上架方案仍为占位。

---

## 安装

> 手动安装可用；市场上架待定。

**手动安装**

- 将构建产物（`main.js`、`manifest.json`、`styles.css`）放入库的 `.obsidian/plugins/mosaic/` 目录后启用插件。

**社区市场**

- （占位：上架计划与安装入口。）
