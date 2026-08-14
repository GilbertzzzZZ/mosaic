# Mosaic

> Mosaic 是 Obsidian 的声明式内容块渲染插件：在 md / mdx 中按约定语法声明内容块，插件识别、解析后渲染为富交互内容。
> 笔记如 mosaic（马赛克拼图）——chart、metric grid、card 一块块内容块，拼合成完整的阅读画面。

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

**Code fence（代码围栏）**

````text
```chartview
type: Pie
data: ...
options: ...
```
````

**自闭合标签**（一行一个属性）

```text
<Chart
  title="Monthly Active Paid Rate"
  dataset="data/metrics/monthly-active-paid-rate.dataset.json"
  type="line"
  x="period"
  series="paid rate,piano,violin"
  unit="%"
  labels="all"
  from="2024-07-01"
  to="2026-07-01"
  granularity="month"
  granularityOptions="month,quarter"
  note="Paid rate = paying users / active users; quarterly view is the arithmetic mean of monthly rates."
/>
```

**成对标签**（`<Chart>` 内联 CSV 已可用；其余内容块类型规划中——属性写在开标签上，数据 payload 写在标签体内）

````text
<MetricGrid title="Product Overview">
```csv
label,value,delta,note,status
Total users,1.98M,,students 1.62M,neutral
New users / mo,20K,,piano 251/day; violin 350/day,neutral
MAU,132K,,avg WAU 67K; DAU 25K,neutral
Active paid rate,2.6%,,piano 1.1%; violin 3.1%,neutral
```
</MetricGrid>
````

---

## 内容块类型

> Chart 可用；其余类型为规划中的占位。

**Chart**

- 基于 AntV 的数据可视化：Pie、Bar、Radar、Treemap、WordCloud、DualAxes、TinyLine、OrganizationTreeGraph、Mix 等。
- Word Count 模板：按单文件、多文件、文件夹或全库统计词频出图。

**MetricGrid**（规划中）

- （占位：指标网格，每格含 label、value、delta、note。）

**Card**（规划中）

- （占位：卡片式内容块。）

**更多类型**（规划中）

- （占位：按同一管线扩展的其他内容块类型。）

---

## 数据来源

> 内容块的数据可以内联书写，也可以来自库内文件或外部数据集。

**内联数据**

- 数据直接写在声明体内，适合小数据量、一次性图表。

**CSV 文件**

- 从库内 CSV 文件加载，支持多文件合并。
- 桌面端支持从外部 CSV 文件导入数据。

**外部数据集（dataset manifest）**

- 数据文件旁放置 `.dataset.json` sidecar manifest，声明指标口径与上卷规则。
- 标签声明时间区间与展示粒度，插件按 manifest 完成区间过滤与粒度上卷。
- 口径信息（label、note、溯源脚注）随图可见。
- 设计细节见 [[docs/dataset-guide|dataset-guide.md]]。

**Dataview 集成**

- 支持在数据声明中调用 Dataview 查询结果出图。

---

## 配套能力

> 降低书写成本的工具与交互。

**交互**

- 支持开启图表搜索交互（search interaction）。

**安全边界**

- 不执行 SQL、公式求值与脚本。
- 不访问库（vault）外文件，不发起网络请求。

---

## Roadmap

> 已规划、尚未实现的方向，均为占位。

- （占位）MetricGrid 内容块类型。
- （占位）Card 内容块类型。
- （占位）Live Preview 渲染支持。
- （已完成 2026-08-14）插件 id 已迁移为 `mosaic`；市场上架方案仍为占位。

---

## 安装

> 手动安装可用；市场上架待定。

**手动安装**

- 将构建产物（`main.js`、`manifest.json`、`styles.css`）放入库的 `.obsidian/plugins/mosaic/` 目录后启用插件。

**社区市场**

- （占位：上架计划与安装入口。）
