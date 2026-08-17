<!-- markdownlint-disable -->

<h1 align="center">Mosaic</h1>

<p align="center"><em>Obsidian 的声明式内容块</em></p>

<p align="center">
  <a href="https://github.com/GilbertzzzZZ/mosaic/releases"><img src="https://img.shields.io/github/v/release/GilbertzzzZZ/mosaic?style=for-the-badge&colorA=263238&colorB=4CAF50&label=VERSION" alt="Release"></a>
  <a href="#六类内容块"><img src="https://img.shields.io/badge/Blocks-6-43A047?style=for-the-badge&colorA=263238&colorB=43A047" alt="Block types"></a>
  <a href="https://obsidian.md"><img src="https://img.shields.io/badge/Obsidian-1.13.0%2B-7C3AED?style=for-the-badge&colorA=263238&colorB=7C3AED" alt="Obsidian"></a>
  <a href="../LICENSE"><img src="https://img.shields.io/badge/License-MIT-1976D2?style=for-the-badge&colorA=263238&colorB=1976D2" alt="License"></a>
</p>

<p align="center"><a href="../README.md">English</a> | <b>简体中文</b></p>

<br />

<p align="center">
  <img src="_assets/readme-chart.png" alt="阅读视图中渲染的内联组合图" width="760" />
</p>

> 英文版为准，本文是镜像翻译。

## 介绍

**在笔记里写一段纯文本声明，就地渲染成图表、表格、时间线或流程图——不依赖外部服务，也不改动源文件。**

- **六类内容块，一套契约**——Chart、DataTable、MetricGrid、Timeline、DecisionBox、FlowDiagram，无论用哪种写法，读的都是同一套属性。
- **每类都有两种写法**——标签（`<Chart …>`）或代码块（```` ```chart ````）。结果完全一致，挑一种能在你的编辑习惯下活下来的即可。
- **数据留在原地**——笔记里的内联 CSV、JSON、Markdown 表格，或者 vault 里别处的 `.dataset.json` manifest。
- **报错不会毁掉整页**——写坏的块只渲染一个内联错误框，附带准确的行号范围，笔记其余部分照常渲染。
- **数据不出 vault**——无网络请求、无遥测、无账号、不执行代码。

<p align="center">
  <img src="_assets/readme-blocks.png" alt="MetricGrid 与 Timeline 区块" width="760" />
</p>

> **\<待补全\>** —— 两张截图早于当前的边框样式，会重拍。

## 目录

- [介绍](#介绍)
- [运行要求](#运行要求)
- [安装](#安装)
- [快速上手](#快速上手)
- [六类内容块](#六类内容块)
- [排错](#排错)
- [Roadmap](#roadmap)
- [文档](#文档)
- [隐私与披露](#隐私与披露)
- [开发](#开发)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 运行要求

- **Obsidian 1.13.0 及以上**。
- **阅读视图**。内容块只在阅读视图渲染，Live Preview 支持在计划中但尚未实现。粘贴示例后看到的是原始文本，用 `Cmd/Ctrl + E` 切过去。
- **`.md` 与 `.mdx`**。Obsidian 原生打开 `.md`；Mosaic 额外注册了 `.mdx` 扩展名，让这类文件也用 Markdown 编辑器打开——**这对 vault 里的每个 `.mdx` 文件生效**，不论其中有没有 Mosaic 块。若已有别的插件占用了 `.mdx`，Mosaic 跳过注册，其余功能不受影响。

## 安装

**从社区插件安装**（等待目录审核）：上架后在 设置 → 第三方插件 中搜索 "Mosaic"。

**手动安装**：从 [最新 release](https://github.com/GilbertzzzZZ/mosaic/releases/latest) 下载 `main.js`、`manifest.json` 与 `styles.css`，拷进 `<vault>/.obsidian/plugins/mosaic/`，然后在 设置 → 第三方插件 中启用 **Mosaic**。

## 快速上手

把下面这段粘进笔记，切到阅读视图：

````text
<Chart title="Monthly signups" type="combo" x="month" bars="Trials" lines="Signups" labels="all">
```csv
month,Trials,Signups
2025-01,420,120
2025-02,480,140
2025-03,560,160
2025-04,530,150
2025-05,620,180
2025-06,700,200
```
</Chart>
````

同一个块写成代码块，属性从标签上挪进 `---` 属性区：

````text
```chart
---
title: "Monthly signups"
type: combo
x: month
bars: Trials
lines: Signups
labels: all
---
month,Trials,Signups
2025-01,420,120
2025-02,480,140
```
````

两种形态交给解析层的结构完全相同，所以下面每一个属性在两种写法里都成立。

## 六类内容块

| 内容块 | 做什么 | 数据来源 |
| --- | --- | --- |
| `Chart` | 折线、柱状、分组柱、堆叠柱、组合图与双轴图 | 内联 CSV，或外部数据集 |
| `DataTable` | 可排序的数据表，列宽自动布局 | 内联 CSV / JSON / Markdown 表，或外部数据集 |
| `MetricGrid` | 按状态着色的指标卡片，自适应网格 | 仅内联 |
| `Timeline` | 纵向时间线，节点按状态着色 | 仅内联 |
| `DecisionBox` | 结构化决策记录，附一条永不报错的自由文本回退 | 仅内联 |
| `FlowDiagram` | 自动布局的流程图（SVG） | 仅内联 |

<details>
<summary><b>Chart</b>——六种图型，内联或外部数据</summary>

`type` 接受 `line`、`bar`、`grouped-bar`、`stacked-bar`、`combo` 与 `combo-dual-axis`。不写的话，多系列取 `line`，单系列取 `bar`。

````text
<Chart title="Weekly active users" type="line" x="week" y="users" unit="people">
```csv
week,users
2025-W01,1240
2025-W02,1310
2025-W03,1180
2025-W04,1420
```
</Chart>
````

Chart 还有第三种写法：由外部数据集 manifest 驱动的自闭合标签，支持时间范围过滤与粒度上卷。

```text
<Chart
  dataset="finance.dataset.json"
  type="combo-dual-axis"
  x="AnchorDate"
  bars="Revenue"
  lines="Margin"
  granularity="month"
  granularityOptions="month,quarter"
/>
```

完整属性表与报错清单见 [guides/chart.md](guides/chart-zh.md)。

</details>

<details>
<summary><b>DataTable</b>——内联表格或外部数据集</summary>

````text
<DataTable title="Open incidents" columns="id,service,severity,owner">
```csv
id,service,severity,owner
INC-104,checkout,high,alice
INC-108,search,medium,bob
INC-111,billing,low,carol
```
</DataTable>
````

`columns` 决定显示哪些列、按什么顺序；不写则渲染找到的全部列。payload 也可以是 JSON 或普通的 Markdown 表格。

完整属性表见 [guides/data-table.md](guides/data-table-zh.md)。

</details>

<details>
<summary><b>MetricGrid</b>——按状态着色的指标卡片</summary>

````text
<MetricGrid title="This week">
```csv
label,value,delta,note,status
Active users,12.4k,+5%,vs last week,good
Retention,42%,-3%,needs attention,risk
Avg order value,$88,+1%,flat,watch
```
</MetricGrid>
````

`status` 归一化为四个桶：`good`、`risk`、`watch` 与默认的 `neutral`。`delta` 以 `+` 或 `-` 开头时卡片会自行着色，`status` 可以不写。

完整契约见 [guides/metric-grid.md](guides/metric-grid-zh.md)。

</details>

<details>
<summary><b>Timeline</b>——纵向里程碑</summary>

````text
<Timeline title="Release plan">
```json
[
  {"date":"2026-01-06","title":"Kickoff","body":"Scope locked","status":"done"},
  {"date":"2026-01-13","title":"Design review","body":"Two open risks","status":"blocked"},
  {"date":"2026-01-20","title":"Build","body":"API integration","status":"active"},
  {"date":"2026-01-27","title":"Launch","body":"Not scheduled yet"}
]
```
</Timeline>
````

`status` 归一化为 `done`、`blocked`、`active` 与 `default`。没有必填字段——一行全空也只是渲染出一个空节点，而不是报错。

完整契约见 [guides/timeline.md](guides/timeline-zh.md)。

</details>

<details>
<summary><b>DecisionBox</b>——结构化决策记录</summary>

````text
<DecisionBox title="Storage engine" status="accepted" owner="alice" source="RFC-001">
```csv
label,value
Decision,Use SQLite for local cache
Cost,Roughly two weeks of migration
Alternatives,Postgres (too heavy), flat files (no queries)
```
</DecisionBox>
````

`status` 接受 `accepted`、`proposed`、`rejected` 与 `superseded`，各有自己的强调色。DecisionBox 是唯一一个在非结构化 payload 下也不报错的内容块——写一段话而不是若干行，它就按散文渲染。

完整契约见 [guides/decision-box.md](guides/decision-box-zh.md)。

</details>

<details>
<summary><b>FlowDiagram</b>——自动布局的流程图</summary>

````text
<FlowDiagram title="Incident response">
```json
{
  "nodes": [
    {"id": "a", "label": "Alert fires", "type": "start"},
    {"id": "b", "label": "Page on-call?", "type": "decision"},
    {"id": "c", "label": "Resolve", "type": "end"}
  ],
  "edges": [
    {"from": "a", "to": "b"},
    {"from": "b", "to": "c", "label": "yes"}
  ]
}
```
</FlowDiagram>
````

也支持表格式写法——一行一个节点，用 `next` 列生成边：

````text
<FlowDiagram title="Incident response">
```csv
id,label,type,next
a,Alert fires,start,b
b,Page on-call?,decision,c
c,Resolve,end,
```
</FlowDiagram>
````

完整契约见 [guides/flow-diagram.md](guides/flow-diagram-zh.md)。

</details>

## 排错

**看到的是原始文本，不是图表。** 内容块只在阅读视图渲染，用 `Cmd/Ctrl + E` 切过去。

**标签完全没被接管，笔记原样显示它。** 三条规则约束标签写法，而且都来自 Obsidian 切分段落的方式，不是 Mosaic 的限制：

1. **开标签必须写在一行内。** 属性折行会让 Obsidian 把它当成普通段落。
2. **标签体内不能有空行。** 空行会提前结束 HTML 块，围栏与闭合标签就变成了独立段落。
3. **闭合标签要独占一行**，拼写与开标签完全一致（`</DataTable>`，大小写敏感）。

属性名还必须是纯 ASCII。**代码块写法没有这些限制**——标签不听话，或者需要非 ASCII 属性名时，改用代码块。

**报错 "Provide either dataset= or an inline body, not both."** 两个数据源是刻意互斥的：外部数据集与内联行没有合理的合并语义，与其发明一套没人记得住的规则，不如直接拒绝。

**图是空的，但没有错误框。** 阅读视图按需渲染章节。把块滚进视口；仍然是空的就重开笔记。

## Roadmap

- **Live Preview 渲染**——呼声最高的缺口，目前只在阅读视图渲染。
- **更多内容块类型**——内置的六类是起点，不是上限。

详细定位与架构说明见 [mosaic-intro.md](mosaic-intro.md)。

## 文档

各内容块的参考指导都是中文，每篇都带完整属性表、payload 契约与报错清单。`mosaic-intro` 以英文版为准，中文版是镜像翻译。

- [Mosaic intro 中文版](mosaic-intro-zh.md)（[English](mosaic-intro.md) 为准）——定位、架构与 Roadmap
- [标签写法通则](guides/tag-syntax-zh.md)——所有标签共用的写法规则、行提取、按原文渲染的情形
- [Chart](guides/chart-zh.md)——三种写法、完整属性表、报错示例
- [DataTable](guides/data-table-zh.md)——内联表格或外部数据集
- [MetricGrid](guides/metric-grid-zh.md)——按状态着色的指标卡片
- [Timeline](guides/timeline-zh.md)——按状态着色的纵向时间线
- [DecisionBox](guides/decision-box-zh.md)——结构化 label/value 清单，或自由文本回退
- [FlowDiagram](guides/flow-diagram-zh.md)——自动布局流程图，graph JSON 或行数据形态
- [Dataset 指导](guides/dataset-guide-zh.md)——数据集 manifest 契约、查询语义、排错

设计说明（为什么这么设计）：[architecture](design/architecture.md)，以及 [design/](design/) 下每类内容块各一篇。

## 隐私与披露

Mosaic 完全本地、完全离线：

- **无网络请求。** 不抓取、不上传、不回传任何东西。
- **无遥测、无分析**，客户端与服务端都没有。
- **无账号、无付费、无广告。** 所有功能开箱即用。
- **不访问 vault 之外的文件。** 数据集 manifest 相对引用它的笔记解析，并通过 Obsidian 自己的 vault API 读取。
- **不执行代码。** 无 SQL、无公式求值、无脚本——声明只被解析，绝不被执行。

图表由 [Ant Design Charts](https://github.com/ant-design/ant-design-charts)（AntV）渲染，以 MIT 许可打包进 `main.js`。

## 开发

```bash
npm install
npm test        # node --test，只测纯数据层模块
npm run build   # tsc typecheck + esbuild 打包 -> main.js
```

发版流程见 [guides/publishing-to-obsidian.md](guides/publishing-to-obsidian.md)。

## 参与贡献

Bug 报告与需求请提到 [Issues](https://github.com/GilbertzzzZZ/mosaic/issues)。渲染类 bug 请附上：

- 块声明本身（每个块的错误框上都有复制按钮，产出的报告可直接粘贴）。
- 你的 Obsidian 版本与 Mosaic 版本。
- 笔记是 `.md` 还是 `.mdx`。

## 许可证

MIT，见 [LICENSE](../LICENSE)。
