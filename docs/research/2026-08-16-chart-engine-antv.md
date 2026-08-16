# 图表引擎选型调研：AntV 生态（当前方案 / 基线）

**调研日期**：2026-08-16
**调研对象**：`@antv/g2` 5.4.8（经 `@ant-design/plots` 2.6.8 间接引入）及 AntV 全家族
**定位**：本插件正在使用的方案，作为 ECharts / AG Charts 两份报告的对照基线

**取证口径**：源码 > 官方文档 > 博客。所有体积数字来自本机实跑 esbuild（`target: es2017`、`format: cjs`、`minify: true`、external `obsidian`/`electron`/node builtins），所有 API 结论来自源码定位并附路径行号，所有维护数据来自 npm registry API 与 GitHub API 实查。查不到的一律标注「查不到」。

---

## 一句话结论

G2 的能力上限不低（本插件十六项里没有一项是被引擎能力卡死的），但**开箱即用程度很差**——十六项里只有 1 项是内置默认行为，10 项要写代码，2 项在引擎层面根本做不到、只能绕；而更致命的是**维护状态**：G2 最新版 5.4.8 发布于 2026-01-06，至今 221 天无新版，仓库近 90 天仅 4 个 commit 且全是站点公告，`@antv/coord` 已 996 天未发版，官网公告栏已改为推广 AI 平台 Sive，六个渠道查不到任何 v6 路线图——**留在 AntV 意味着已知的坑没有一个会被上游修掉**。

---

## 1. 生态版图

### 1.1 包清单

数据来源：`https://registry.npmjs.org/<pkg>`（scoped 包 URL-encode）取 `dist-tags.latest` / `time[latest]` / `license`；GitHub API 取 commit 与 issue。**「距今」以 2026-08-16 计。**

| 包名 | 干什么 | 最新版 / 发版日 | 距今 | License | 本插件是否必需 |
| --- | --- | --- | --- | --- | --- |
| `@antv/g2` | 图形语法统计图表引擎，**真正干活的那个** | 5.4.8 / 2026-01-06 | **221 天** | MIT | **必需** |
| `@ant-design/plots` | G2 的 React 封装层 | 2.6.8 / 2025-12-24 | 234 天 | MIT | **非必需**（见 §5） |
| `@ant-design/charts` | plots + graphs 聚合入口，本体只有 19 个文件无实现 | 2.6.7 / 2025-12-23 | 235 天 | MIT | 否 |
| `@antv/g` | 底层渲染引擎（umbrella 包） | 6.3.1 / 2025-12-24 | 234 天 | MIT | 间接必需 |
| `@antv/g-lite` | G 的核心实现（场景图、文本测量、事件） | 随 g 发布 | — | MIT | 间接必需 |
| `@antv/g-canvas` | Canvas 渲染后端 | 2.2.0 / 2025-12-24 | 234 天 | MIT | 间接必需 |
| `@antv/g-svg` | SVG 渲染后端 | 2.1.1 / 2025-12-24 | 234 天 | MIT | 否 |
| `@antv/g-webgl` | WebGL 渲染后端 | 2.1.1 / 2025-12-24 | 234 天 | MIT | 否 |
| `@antv/component` | 轴 / 图例 / tooltip 等 UI 组件 | 2.1.11 / 2025-11-21 | 267 天 | MIT | 间接必需 |
| `@antv/scale` | 比例尺与刻度算法 | 0.5.2 / 2025-09-04 | 345 天 | MIT | **直接依赖**（`wilkinsonExtended`） |
| `@antv/coord` | 坐标系变换 | 0.4.7 / 2023-11-23 | **996 天** | MIT | 间接必需 |
| `@antv/g6` | 关系图 / 网络图 | 5.1.1 / 2026-05-08 | 99 天 | MIT | 否 |
| `@antv/x6` | 流程图编辑器 | 3.1.8 / 2026-08-11 | **4 天** | MIT | 否 |
| `@antv/s2` | 透视表 / 交叉表 | 2.7.2 / 2026-06-10 | 66 天 | MIT | 否 |
| `@antv/l7` | 地理空间可视化（自研 WebGL） | 2.29.1 / 2026-07-13 | 33 天 | MIT | 否 |
| `@antv/f2` | 移动端图表 | 5.14.0 / 2025-11-10 | **278 天** | MIT | 否 |
| `@antv/g2plot` | G2 4.x 时代的高层封装，**已停更** | 2.4.35 / 2025-09-19 | 330 天 | MIT | 否 |
| `@antv/g2-extension-plot` | G2 官方扩展（旭日图等） | — | — | MIT | 否（被 plots 强制拖入） |

**全部 MIT**，无一个包被打上 npm package 级 `deprecated`。

### 1.2 `@antv/g2` 与 `@ant-design/plots` 的关系

- `@ant-design/plots` 的 dependencies：`@antv/g2 ^5.2.7`、`@antv/g ^6.1.7`、`@antv/g2-extension-plot ^0.2.1`、`lodash`、`@antv/event-emitter`、`@ant-design/charts-util`。
- peerDependencies：`react >=16.8.4`、`react-dom >=16.8.4`。
- 依赖是**单向**的：plots → g2，g2 完全不知道 plots 存在。
- `@antv/g2` 自带完整独立入口（`main` / `module` / `unpkg` / `exports` 齐全，**无任何 peerDependencies，不依赖 React**）。

**结论：`@ant-design/plots` 不是必需的。** 它只是一层 React 封装 + 一套「简写配置转 G2 spec」的转换器。本插件为它付出的代价见 §4.2 与 §5。

### 1.3 `@antv/g` 在家族里的位置

`@antv/g` 是 G2 / G6 / S2 / F2 共用的底层渲染引擎（场景图 + 多后端渲染 + 文本测量 + 事件系统）。但**共用得并不干净**：

| 包 | 底层引擎 | 证据 |
| --- | --- | --- |
| G2 | `@antv/g ^6.1.24` | `G2/package.json` |
| G6 | `@antv/g ^6.1.28` | `G6/packages/g6/package.json:63` |
| S2 | `@antv/g ^6.3.1` | `S2/packages/s2-core/package.json:77` |
| X6 | **无 `@antv/g`**，原生 SVG/HTML | `X6/package.json:44-49` |
| L7 | **自研 WebGL**（gl-matrix + 自写 shader） | `L7/packages/core/package.json:23-31` |
| F2 | **`@antv/f-engine`**（独立移动端引擎） | `F2/packages/f2/package.json:35` |

六个库分裂成**四套底层**，且共用 `@antv/g` 的三家版本号还各不相同（6.1.24 / 6.1.28 / 6.3.1）——同项目引入会出现多份 `@antv/g` 实例。

### 1.4 维护状态（F2 与 L7 专项核实）

| repo | star | archived | 最后 commit | 近 90 天 commit | open issue | npm 最后发版 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **G2** | 12,591 | false | 2026-07-15（站点公告） | **4** | 174 | 2026-01-06 | **停滞** |
| G6 | 12,248 | false | 2026-07-15 | 3 | 322 | 2026-05-08 | 停滞 |
| X6 | 6,668 | false | 2026-08-11 | 8 | 137 | 2026-08-11 | 活跃 |
| S2 | 1,685 | false | 2026-06-11 | 13 | 94 | 2026-06-12 | 低速活跃 |
| L7 | 4,048 | false | 2026-07-30 | **73** | 199 | 2026-07-30（beta） | **代码活跃、issue 无人管** |
| **F2** | 7,994 | false | **2026-04-07** | **0** | **303** | **2025-11-10** | **事实停维** |
| `antvis/G`（渲染底座） | 1,210 | false | **2026-03-01** | **0** | 42 | 2025-12-24 | **休眠** |
| G2Plot | 2,654 | false | 2026-03-03 | 0 | 460 | 2025-09-19 | 停维 |
| ant-design-charts | 2,233 | false | **2026-01-29** | **0** | 272 | 2025-12-24 | **停维** |

**F2**：近 90 天 0 commit、0 open PR、303 个 open issue、npm 278 天未发版，2026 年的 3 个新 issue 全部无人回复。**但仓库和 README 里没有任何 deprecated / 归档声明**——属于静默停更，不要指望 npm 或 README 给提示。

**L7**：近 90 天 73 个 commit，正在做 v3（`3.0.0-beta.1` 发布后回退，改走 `2.30.0-beta.x`）。但最近 5 个 open issue（2026-06 至 2026-08）全部 0 评论。属于「代码在动、社区不管」。

**最关键的一条**：`@ant-design/plots` 所在的 `ant-design/ant-design-charts` 仓库**自 2026-01-29 起 0 commit**，272 个 open issue 无人处理。本插件当前正建立在这一层之上。

### 1.5 装一个包能得到什么

装 `@ant-design/plots` 一个包，得到的是：统计图表全套 + React 绑定 + 一层配置转换器，**但同时被迫拖进 `@antv/g2-extension-plot` 和整份 `@antv/g` dist**（含 200 KB 的 html2canvas，见 §4.2）。

要覆盖常见需求的最小包组合（详见 §2）：**4 个包**（g2 + g6 + x6 + s2），加上地图和移动端要到 **8 个包**。

---

## 2. 图形类型覆盖

### 2.1 覆盖表

| 图形类型 | 是否支持 | 在哪个包里 | 额外依赖 | 限制 |
| --- | --- | --- | --- | --- |
| 折线 / 柱 / 面积 / 散点 | 内置直接支持 | G2 `mark.line/interval/area/point` | 否 | 无（`G2/src/lib/core.ts:232-255`） |
| 饼图 | 内置直接支持 | G2 `interval` + `coordinate.theta` | 否 | 需显式配 theta 坐标系 |
| 关系图 / 网络图 | 内置直接支持 | **G6**（G2 也有 `mark.forceGraph`） | 否 | G6 九种布局（`G6/.../build-in.ts:153-173`） |
| 流程图 | 内置直接支持（编辑器原语） | **X6** | 自动布局要 `@antv/layout` | X6 只给原语，官方 flowchart demo **571 行** |
| 思维导图 | 内置（只读渲染） | **G6** `mindmap` 布局 | 否 | 可交互增删要 X6 自写，demo **390 行** |
| 树图 treemap | 内置直接支持 | G2 `mark.treemap` | 否 | 无（`G2/src/lib/graph.ts:21`） |
| 树形图 tree | 内置直接支持 | G2 `mark.tree`；G6 三种树布局 | 否 | 无 |
| 甘特图 | **需自己预处理数据** | G2 `interval` | 否 | **无专用 mark**；缺依赖箭头、里程碑、进度条、时间轴缩放 |
| 桑基图 | 内置直接支持 | G2 `mark.sankey` | 否 | 无 |
| 漏斗图 | 内置直接支持 | G2 `interval` + `shape: funnel` | 否 | 需同时配 shape + `symmetryY` + transpose |
| 地图 | 内置直接支持 | G2 `geoView`（无底图）；**L7**（有底图） | L7 要 `@antv/l7-maps`，行政区还要 `@antv/l7plot` | G2 **无瓦片底图**；L7 必须接高德/Mapbox key |
| 透视表 / 交叉表 | 内置直接支持 | **S2** | 否 | 无 |
| 时间线 | **需组合多个 mark** | G2 手拼 / X6 | 否 | **无内置**；X6 demo **543 行** |
| 仪表盘 | 内置直接支持 | G2 `mark.gauge` / `mark.liquid` | 否 | 无 |
| 词云 | 内置直接支持 | G2 `mark.wordCloud` | G2 不需要 | F2 要 `@antv/f2-wordcloud` |
| **日历热力图** | **需自己预处理数据** | G2 `mark.cell` | 否 | **全仓库无日历布局、无 demo**，要自己算周序号/星期几 |
| 箱线图 | 内置直接支持 | G2 `mark.box` / `mark.boxplot` | 否 | 无 |
| 雷达图 | 内置直接支持 | G2 `coordinate.radar` + `AxisRadar` | 否 | 填充效果需 line + area 两 mark 叠加 |
| 和弦图 | 内置直接支持 | G2 `mark.chord` | 否 | 无 |
| 旭日图 | 内置支持但**要额外包** | `@antv/g2-extension-plot` | **是** | G2 core 只有 `partition`（冰柱图） |
| 平行坐标 | 内置直接支持 | G2 `coordinate.parallel` | 否 | 无 |
| K 线 / 蜡烛图 | **需组合多个 mark** | G2（`link` + `interval`） | 否 | 无专用 mark，要自己算涨跌色（F2 反而有内置 `Candlestick`） |
| 瀑布图 | **需自己预处理数据** | G2（`link` + `interval`） | 否 | 累计值手写在数据里，连接线要写 `custom` transform |
| 热力图（矩阵） | 内置直接支持 | G2 `mark.cell` / `mark.heatmap` | 否 | 无 |
| 河流图 | 内置直接支持 | G2 `area` + `stackY` + `symmetryY` | 否 | 要显式串两个 transform |

### 2.2 「要覆盖 N 种图就得引 N 个库」的代价

**最小包组合：4 个包**（`@antv/g2` + `@antv/g6` + `@antv/x6` + `@antv/s2`）。按需追加到 8-10 个（旭日图 `+g2-extension-plot`，带底图地图 `+l7 +l7-maps +l7plot`，X6 布局 `+layout` 或 `+hierarchy`，移动端 `+f2`）。

代价三条，都实测确认：

**（1）体积**：四个包 unpacked 分别是 8.42 / 7.25 / 8.17 / 14.78 MB。打包后各自的运行时体积无法叠加估算，但**底层不共享**——X6 不用 `@antv/g`，L7 自研 WebGL，所以引第二个库基本等于第二份完整运行时。

**（2）API 风格完全不统一**——五种心智模型：

| 包 | 范式 |
| --- | --- |
| G2 | 声明式图形语法 `chart.options({type, data, encode, scale, coordinate, transform})` |
| G6 | 声明式配置对象 `new Graph({data:{nodes,edges}, node, edge, layout, behaviors})` |
| X6 | **命令式** `new Graph({container})` 再 `graph.addNode()`，逐节点写 `attrs` |
| S2 | 三参数构造 `new PivotSheet(dom, dataCfg, options)` |
| L7 | 场景 + 图层链式 `new Scene({map})` + `new PointLayer().source().color()` |
| F2 | JSX / React 组件树 |

**（3）主题完全不共用，没有任何共享 theme 包**：

- G2：`colorBlack` / `colorStroke` / `category10` / `padding1`（`G2/src/theme/light.ts:5-49`）
- G6：`bgColor` / `nodeColor` / `edgeColor` / `textColor`（`G6/packages/g6/src/themes/light.ts:4-21`）
- S2：`PaletteMeta` 结构 + `generatePalette` 算色板（`S2/.../theme/palette/default.ts:4-30`）
- F2：扁平配置对象（`F2/packages/f2/src/theme.ts`）
- X6：**根本没有主题系统**，`src/style/themes/default.less` 里只有一个 class 前缀变量，样式全靠逐节点 `attrs`

**对本插件的直接后果**：现在这套「跟随 Obsidian 明暗主题」的注入逻辑（`chart-theme.ts` 40 行代码 + 配置侧 5 个 `apply*` 函数）是**为 G2 一家写的**。哪天要加一张关系图或透视表，这套东西一行都不能复用，得为 G6 / S2 各写一份。

全家族唯一一处真正的跨包互操作是 S2 的 `pivot-chart` 扩展能把 G2 图表渲染进单元格（`S2/.../pivot-chart/cell/chart-data-cell.ts:2`）。除此之外包与包之间没有互通。

### 2.3 这一家做不到的常见类型

**完全没有内置，要自己造**：

1. **日历热力图** —— 六个仓库零实现、零 demo，只在文档里被列为 `cell` mark 的适用场景（`G2/site/docs/manual/core/mark/overview.en.md:94`）。
2. **时间线** —— 无专用 mark/组件。X6 官方 demo 543 行。
3. **甘特图** —— 无专用 mark，文档给的方案是 `interval` 的 `y/y1` 双值 + transpose，缺依赖箭头、里程碑、进度条、时间轴缩放。

**要自己算数据**：瀑布图（累计值手写）、K 线（两 mark 叠加 + 自判涨跌）。

**要写几百行**：可编辑流程图 / BPMN / ER / 组织架构（X6 官方 showcase：flowchart 571 行、bpmn 395 行、dag 382 行、er 348 行）。

---

## 3. 十六项对照

**代码行数口径**：`src/render/chart-tag-config.mjs`（共 1082 行，其中 **699 行代码 / 339 行注释 / 44 行空行**，注释占比 **33%**）里该项对应构造的**代码行**，不含注释；跨文件的另行标注。

**先给一个总体读数**：十六项在 `chart-tag-config.mjs` 里合计约 **393 行代码**，另有 **174 行注释是专门记录踩坑与「为什么不能那样写」的**——这 174 行不是文档洁癖，是每一项绕过引擎限制后必须留下的路标。

| # | 项目 | 结论 | 实际行数 | 踩了什么坑 |
| --- | --- | --- | --- | --- |
| 1 | 折线粗细可配 | **一个配置项** | **1 行**（`LINE_STROKE`，:47） | v5 主题默认给 1（v4 是 2），升级后折线退成发丝，必须显式写回。注意是硬编码常量，**并未对用户开放** |
| 2 | 数据标签防碰撞（错开优先、隐藏兜底） | **少量代码** | **5 行**（`LABEL_TRANSFORM`，:110-114）+ 6 行顺序约束注释 | 三段顺序**不可换**：三个变换都以「先把全部标签设为可见」开头且从左到右复合，**后一个隐藏型会撤销前一个的隐藏结果**，所以隐藏型只能有一个且必须最后。另有一份视图级 `labelTransform` **从未生效**（见下方「死配置」） |
| 3 | 组合图去掉重复右轴 | **少量代码** | **11 行**（`lineAxis` 三元，:811-823） | `position: "right"` 原本无条件写死；折线与其数据点共用同一段 y scale，G2 按 scale 分组合并 guide，`lineChild`/`pointChild` 两份 axis 必须**逐字一致**，否则后写的覆盖先写的 |
| 4 | 堆叠柱数字在色块正中间 | **少量代码** | **11 行**（`LABEL_CENTER` :154-159 + `valueLabel` 分流 :434-438） | 三个连带项缺一不可：`dy` 必须归零、正负分流的三个回调必须**全部去掉**（`inside` 对正负是同一答案）、变换链必须留空。`"middle"`/`"center"` **不是合法取值，写了抛异常** |
| 5 | 图例标记尺寸与形状 | **要自己实现** | **25 行**（自定义 symbol 10 行 :60-69 + 常量 2 行 + `legendConfig` 13 行）+ **12 行**坑说明 | 三条硬伤：内置 `line` 画的是**竖线**（`G2/src/utils/marker.ts:114-118` 实为 `M x,y+r → L x,y-r`）；内置 `hyphen` 虽是横杠，但 `hyphen.style = ['stroke','lineWidth']`（:160）会触发 `scaleToPixel` 反向缩放；`itemMarkerSize` 是**整个图例共享的标量**，方块要 12、横杠要 22.7，没法共存。唯一解是注册 `.style = ['fill']` 的自定义形状（fill 类 lineWidth 恒 0，不触发反缩放）。另外 `itemMarkerLineWidth: 0` **必须显式写**，否则自动塞 4 把方块缩水三成 |
| 6 | 图例位置顶部居中 | **一个配置项** | **2 行**（`position` + `layout.justifyContent`） | 没有 `align` 这个键，对齐写在 `layout` 这一层。**居中是相对图例自己的包围盒（≈整个画布宽）而不是绘图区**，单轴图因此偏左约 14px，配置层面无「相对绘图区居中」的开关 |
| 7 | 单位文字放置位置 | **要自己实现（且退出引擎）** | **约 25 行 / 跨 2 文件**（config 侧 17 行 + `ChartFigure` 的 `unitLine` 及 JSX） | 引擎两条路都实测否决：轴标题横排后计算占位的代码**无条件**把标题尺寸加进横向占位（不看 `titlePosition`）；chart 级 `title` 顶部占位从 28px 涨到 64px 且**只有一个**，双轴图两个单位表达不了。最终**退出引擎、走 DOM** |
| 8 | tooltip（紧凑 / 提亮 / 描边 / 边框） | **要自己实现** | **41 行**（`TOOLTIP_CSS` :196-210 + `tooltipStyle` :594-608 + `applyTooltipStyle` :614-623） | 组件把默认样式表以 `element.style.cssText +=` 写成**内联样式**，`styles.css` 不加 `!important` 压不过，只能走 `interaction.tooltip.css`。引擎深色主题另把 title / name-label / value 三条各自染成 `#A6A6A6`，**要逐条盖掉**。`-webkit-text-stroke` **简写不可用**（会把宽度带走），必须拆成 `-webkit-text-stroke-width` + `-webkit-text-stroke-color` 两个 longhand。已知引擎 bug：浮窗首次创建时未入 DOM、尺寸 0×0，**每次重渲染后第一次悬停会错位一帧**（不修，靠 `right-bottom` 定位掩盖） |
| 9 | 标记特定 x 值（加粗 + 色带 / 竖线） | **要自己实现；三件事只做到两件** | **40 行**（4 个函数 + 集成）+ **66 行**坑说明 | 上游语义的三件事：**加粗 ✅**（`labelFontWeight` 可写回调）；**标签背后底色 ❌ 引擎无入口**——轴标签是裸的 `@antv/g` `Text`，`@antv/component@2.1.11` 的 `esm/ui/axis/` 下 grep `background` **零命中**（`backgroundFill` 只存在于 legend / indicator / timebar / select）；**抽稀时强制显示 ❌ 无入口**——`esm/ui/axis/overlap/autoHide.js:14` 只有 `keepHeader` / `keepTail` 两个开关，没有按项豁免。**变通**：底色改画在绘图区里（`rangeX` 色带 / `lineX` 竖线挂 annotations），代价是要为两种 x 比例尺各写一套——**折线图不能用色带**，`mark/range.ts:14` 的 `scale.getBandWidth?.(...) \|\| 0` 在 point 比例尺下**恒返回 0**，色带缩成零宽 |
| 10 | y 轴顶部 8% 空白 + 刻度凑整 | **要自己实现** | **41 行**（`headroomMax`+`yScale`+`domainTicks`+`Y_AXIS` 27 行 + stacked 求和上限 14 行） | 引擎无「留白比例」概念，只能自己算 `max × 1.08` 塞进 `domainMax`。刻度算法要自己从 `@antv/scale` 取 `wilkinsonExtended` 并**再包一层滤掉域外刻度**。stacked-bar 的上限是每期堆叠和，得自己 reduce。DualAxes 默认把每个 child 的 y 设成 `independent`，**必须显式关掉**才能按 key 分组共用 |
| 11 | 主题跟随（明暗切换时重建） | **要自己实现** | **约 100 行 / 跨 4 文件**（`chart-theme.ts` 40 行代码 + config 侧 5 个 `apply*` 函数 ≈44 行 + `ChartFigure` 监听 6 行 + `main.tsx` 广播 10 行） | 引擎主题不读宿主 CSS 变量（G2 画在 canvas 上，取值得走 `getComputedStyle`），网格线 / 悬停蒙层 / 悬停竖线 / tooltip / 标签描边**五处配色全部硬编码**，每一处都要留空壳再注入。**不能用 markdown 重渲染**（与阅读视图虚拟化竞态会丢图），只能广播事件让每个已挂载组件自建。**配置对象不能复用**：plots 渲染时会就地改写传入配置（把 `label` 搬进 `labels` 并打 `__transform__` 标记），**同一对象再渲染一遍标签会被永久清空**，所以每次重建都必须重新 `build()` |
| 12 | PNG 导出 | **一个配置项** | **约 6 行**（`ChartFigure` 里的按钮） | 走 plots 的 `downloadImage()`，内部是原生 `canvas.toDataURL()`。**注意**：直接用 `@antv/g2` 时这个封装没有，要自己取 canvas（约 5 行，见 §5） |
| 13 | 数值标签描边（双层画法） | **要自己实现** | **26 行**（`labelTextStyle` :468-482 + `applyLabelStyle` :490-500）+ **26 行**坑说明 | v5 渲染器对文本**先填充后描边**，描边居中于轮廓、从笔画两侧各吃掉 `lineWidth/2`——实测 `w=2` 时**字整个消失**。只能画两层（光晕层 + 文字层）。上层必须给**透明描边且宽度与下层相同**，否则两层 `renderBounds` 不等，`exceedAdjust` 和 `overlapDodgeY` 会把光晕和字**推分家** |
| 14 | 负值数据标签方向翻转 | **少量代码** | **8 行**（`isNegative` + `LABEL_OUTSIDE`，:137-144） | 三个键缺一不可（`position` / `textBaseline` / `dy`）：负值柱的包围盒**顶边就是零轴**，留在 `'top'` 标签会贴在 0 上、与朝下的柱子背道而驰 |
| 15 | 悬停列背景带 / 竖线 | **要自己实现** | **44 行**（4 个常量 + 4 个 style/apply 函数） | 蒙层配色引擎**硬编码** `#CCD6EC @0.3`，既不读主题也不分明暗（深色底叠出比底色亮 52 的 `#52555C`）。`state.active` **空壳不能省**——`mergeState` 按 mark key 分派，mark 不带这组键时注入无处可落。组合图额外要关掉悬停竖线：tooltip 判定是 `.some()`，**视图里只要有一个 line mark 整个视图就切进 seriesTooltip** |
| 16 | 双轴组合图 | **要自己实现** | **116 行**（`combo` 分支 :758-898）+ 25 行注释 | 单项最大。数据点必须写成折线的**兄弟 mark** 而不是 `point` 简写（简写不继承 `data`/`scale` 且总被追加到末尾会盖住柱子）；一张图**只有一套 color scale**，两个 mark 各给一份 range 会互相覆盖，配色得按绘制顺序拼成一份挂顶层；`interaction` **必须写在顶层**才能被 `bubbleOptions()` 合并回 view；`annotations` 也必须写顶层，否则组合图会画三次 |

### 结论分档汇总

| 档位 | 数量 | 项目 |
| --- | --- | --- |
| **内置默认行为** | **0** | —— |
| **一个配置项** | **3** | 1 折线粗细、6 图例顶部居中、12 PNG 导出 |
| **少量代码（<10 行）** | **3** | 2 防碰撞（5）、14 负值翻转（8）、3 去重复右轴（11，略超） |
| **要自己实现** | **10** | 4 堆叠居中、5 图例标记、7 单位位置、8 tooltip、9 标记 x 值、10 y 轴留白、11 主题跟随、13 标签描边、15 悬停带、16 双轴组合图 |
| **做不到** | **2**（项 9 的两个子项） | 轴标签背后底色、抽稀时强制显示 |

### 一条必须单列的记录：从未生效的死配置

`VIEW_LABEL_TRANSFORM` 曾配在顶层，声称提供跨 mark 的标签防碰撞，**从未运行过**。已在源码两侧完成复核：

- `@ant-design/plots` 的 `VIEW_OPTIONS` 白名单（`es/core/constants/index.js:27-56`）**不含 `labelTransform`**——顶层那份会被下发进每个 mark 并从顶层删除。
- G2 **只从 view 节点读它**：`G2/src/runtime/plot.ts:1188` 是 `const { markState, labelTransform } = view;`。

mark 上那份**无人读取**。而当时的测试断言的是「配置对象上有这个键」，通过了——**配置对，效果是零**。

它同时是个定时炸弹：数值标签是双层画的、两层位置完全重合，`overlapHide` 是「先到先得」，文字层永远排在光晕层之后——一旦真的生效，**所有文字层会被隐藏，数字集体消失**。

**这条对选型的意义**：它不是 AntV 独有的缺陷，而是「配置驱动 + 中间转换层」这个架构的固有风险。评估另外两家时，应重点看**是否存在同样的多层配置转换**。

---

## 4. 硬约束核验

### 4.1 许可证

**全部 MIT**，已逐包核对 `package.json`：`@ant-design/plots` / `@antv/g2` / `@antv/g` / `@antv/g-lite` / `@antv/component` / `@antv/coord` / `@antv/scale` / `html2canvas` 均为 MIT。**无任何合规风险。**

一个例外要记录：`antvis/G` **仓库**未挂 license 文件（GitHub API 返回 `license: null`），但 npm 包元数据是 MIT。

### 4.2 体积（本节全部为本机实跑数字）

**构建参数**：esbuild，`target: es2017`，`format: cjs`，`minify: true`，`treeShaking: true`，external `obsidian` / `electron` / node builtins。

#### 当前产物构成（`main.js` = 1,658,760 B，1620 KB；gzip 496,456 B）

| 包 | 字节 | KB | 占比 |
| --- | --- | --- | --- |
| `@antv/g2`（plots 下的嵌套副本） | 418,240 | 408.4 | 25.2% |
| `@antv/g-lite` | 227,232 | 221.9 | 13.7% |
| **`html2canvas`** | **205,571** | **200.8** | **12.4%** |
| `@antv/component` | 150,018 | 146.5 | 9.0% |
| 项目自身代码 | 78,691 | 76.8 | 4.7% |
| `lodash` | 75,441 | 73.7 | 4.5% |
| `@ant-design/plots` | 74,391 | 72.6 | 4.5% |
| `gl-matrix` | 41,394 | 40.4 | 2.5% |
| `@antv/g-canvas` | 38,355 | 37.5 | 2.3% |
| `@antv/coord` | 37,163 | 36.3 | 2.2% |
| `@antv/g` | 36,332 | 35.5 | 2.2% |
| **`d3-geo`** | **29,084** | **28.4** | 1.8% |
| `preact` | 24,913 | 24.3 | 1.5% |
| `@antv/scale` | 22,413 | 21.9 | 1.4% |
| **`d3-scale-chromatic`** | **18,185** | **17.8** | 1.1% |
| `d3-shape` | 15,842 | 15.5 | 1.0% |
| **`d3-hierarchy`** | **14,518** | **14.2** | 0.9% |
| **`d3-force`** | 7,061 | 6.9 | 0.4% |
| `@antv/g2-extension-plot`（+ 其嵌套 g2 4,176） | 10,594 | 10.3 | 0.6% |
| **`d3-quadtree`** | 5,018 | 4.9 | 0.3% |

> **与任务书给出的数字有出入**：任务书记的是 d3-geo 14KB / d3-scale-chromatic 12KB / d3-hierarchy 7KB / d3-quadtree 5KB。本报告的数字是**打包并 minify 后计入产物的实际字节**（esbuild metafile 的 `bytesInOutput`），口径可能与之前的测量不同。以本节数字为准。

#### 三个可回收的大块

**（1）`html2canvas` 200.8 KB —— 最大的一块，且完全用不到**

来源链已完整追踪：`@antv/g` 6.3.1 的 `dependencies` 里硬依赖 `html2canvas ^1.4.1`，而 `@antv/g` **只发布预打包的 `dist/index.esm.js` 且 `"sideEffects": true`**——esbuild 无法把它摇掉。G2 的每一个 shape 文件都 `import ... from '@antv/g'`，所以只要用 G2 就会带上。

html2canvas 在 `@antv/g` 里的唯一用途是 `ImageExporter.toCanvas()`（`dist/index.esm.js:2163`），用于把 canvas 之上的 HTML 覆盖层一起栅格化。而本插件的 PNG 导出走的是 `@ant-design/plots` 的 `downloadImage()` → `toDataURL()` → **原生 `canvas.toDataURL()`**（`es/hooks/useChart.js:24-28`），**从不经过 ImageExporter**。

**实测可回收**：给 esbuild 加一行 `alias: { html2canvas: '<stub>' }` 后重新构建整个插件——

| | 字节 | KB | gzip |
| --- | --- | --- | --- |
| 现状 | 1,658,760 | 1620 | 496,456 |
| html2canvas 打桩 | **1,450,138** | **1416** | **445,641** |
| **节省** | **208,622** | **203.7 KB（12.6%）** | 50,815 |

**（2）用不到的 d3 模块 72 KB**

| 模块 | 字节 | 被谁拖进来 |
| --- | --- | --- |
| `d3-geo` | 29,084 | `g2/esm/composition/geoView.js`、`d3Projection.js`（地图投影） |
| `d3-scale-chromatic` | 18,185 | `g2/esm/runtime/scale.js`（内置色板） |
| `d3-hierarchy` | 14,518 | `g2/esm/mark/pack.js`、`data/tree.js`、`data/cluster.js` |
| `d3-force` | 7,061 | `g2/esm/mark/forceGraph.js`、`mark/beeswarm.js` |
| `d3-quadtree` | 5,018 | `d3-force` 的传递依赖 |
| **合计** | **73,866** | **72.1 KB** |

根因是 G2 的 `esm/index.js` 默认导出的 `Chart` 用的是 `stdlib()`（全部 mark 全注册），而 `package.json` 把 `./esm/exports.js` 标成 sideEffects——**默认入口不可摇树**。

**（3）plots 层本身 72.6 KB + 被它拖进的 `@antv/g2-extension-plot` 10.3 KB + `lodash` 73.7 KB**

#### 直接用 `@antv/g2` 按需引入能省多少

G2 提供分级 library：`litelib` / `corelib` / `plotlib` / `graphlib` / `geolib` / `stdlib`（`esm/lib/`）。本插件用到的 mark（interval / line / point / lineX / rangeX）、interaction（elementHighlight / tooltip）、labelTransform（三种全要）**`corelib` 全部覆盖**。

四种入口方式实测（仅引擎入口，不含插件业务代码）：

| 变体 | 字节 | KB | gzip | 相对现状 |
| --- | --- | --- | --- | --- |
| A. `@ant-design/plots`（**现状**） | 1,573,583 | 1536.7 | 466,975 | 基准 |
| B. `@antv/g2` 默认 `Chart`（stdlib） | 1,376,373 | 1344.1 | — | −192.6 KB |
| C. `@antv/g2` + `corelib` | 1,289,281 | 1259.1 | 376,558 | −277.6 KB |
| D. `@antv/g2` + 手挑 library | 1,130,548 | 1104.1 | 329,683 | −432.6 KB |
| **C + html2canvas 打桩** | 1,080,447 | 1055.1 | — | **−481.6 KB** |
| **D + html2canvas 打桩** | **923,041** | **901.4** | **281,079** | **−635.3 KB（−40.4%）** |

**结论**：

- **最低成本、最高回报**：只加一行 esbuild alias 把 html2canvas 打桩 → **省 203.7 KB（12.6%）**，代码零改动。
- **换成 `@antv/g2` + `corelib`** → 引擎侧再省约 277.6 KB。
- **两件一起做（手挑 library）** → 引擎侧共省 **635.3 KB / 40.4%**。整个插件产物可望从 1620 KB 降到 **约 990 KB**。

改造代价见 §5.1。

### 4.3 ES2017

**通过，且无隐患。**

- 本项目 esbuild 已配 `target: 'es2017'`（`esbuild.config.mjs:22`），产物 `node --check` 解析通过。
- 已实测排查 plan 里记录的那个陷阱（esbuild 遇到正则 lookbehind 会**静默**改写成 `new RegExp("…")`，把语法错误推迟到插件加载期）：对 `@ant-design/plots/es`、`@antv/g2/esm`、`@antv/g/dist/index.esm.js`、`@antv/g-lite` 全量 grep `(?<=` / `(?<!` —— **零命中**；产物里也没有任何含 lookbehind 的 `new RegExp` 重写。
- `@antv/g` 的 dist 是 Babel ES5 输出（含 `_regeneratorRuntime` / `_classCallCheck`），本身就低于 ES2017。

### 4.4 canvas / PNG 导出

**现状可用。**

- 渲染后端是 `@antv/g-canvas`（真 canvas，非 SVG）。
- 导出链路：`ChartFigure` 按钮 → plots 的 `downloadImage(name)` → `toDataURL()` → **原生 `canvas.toDataURL('image/png')`**（`es/hooks/useChart.js:24-28`），再造一个 `<a download>` 点击。
- **不经过 `@antv/g` 的 `ImageExporter`**，所以那 200 KB 的 html2canvas 是纯死重（见 §4.2）。
- **注意副作用**：因为走的是原生 canvas 快照，**tooltip 这类 DOM 覆盖层不会出现在导出图里**——对本插件是正确行为。
- 直接用 `@antv/g2` 时没有 `downloadImage` 封装，需自己取 canvas 调 `toDataURL`（约 5 行）。

### 4.5 主题切换：现有重建链路是否有更优解

**现状链路**：`main.tsx` 监听宿主 `css-change` → 150ms 防抖 → `window.dispatchEvent('mosaic:theme-change')` → 每个 `ChartFigure` 的监听器 `setRebuildEpoch(e => e+1)` → `useMemo` 重跑 `build(granularity)` → `withTheme()` 重新注入五处配色 → 整图重建。

**评估结论：在 G2 5.4.8 下这已经是最优解，没有更省的路。** 三条理由都有源码依据：

1. **G2 没有「就地换主题」的 API**。`api/runtime.ts:403` 的 `KEYS = ['theme','type','width','height','autoFit']` 走的是整体 `options()` 重设 + 重渲染，与现在的重建等价，省不下渲染开销。
2. **五处配色引擎都硬编码**，不读宿主 CSS 变量（G2 画在 canvas 上，读 CSS token 得走 `getComputedStyle`），所以「注入」这一步无论如何省不掉。
3. **不能改用 markdown 重渲染**——会与阅读视图虚拟化竞态并丢图，这一点代码注释里已记录为实测结论。

**唯一的隐性代价要点名**：每次重建**必须重新 `build()`，绝不能把上次的配置对象交回渲染器**。plots 在渲染时会**就地改写**传入配置（把 `label` 搬进 `labels` 并打 `__transform__` 标记），而它的 transform **不幂等**——同一对象再渲染一遍，`labels` 会被当成上一轮残留清空，**数值标签永久消失**。这是配置转换层带来的第二个陷阱（第一个是 §3 末尾的死配置）。

### 4.6 CJK

**比预期好，是 AntV 的一个真实加分项。**

- **换行**：`@antv/g-lite` 实现了完整的**禁则处理（Kinsoku Shori）**——`dist/index.esm.js:11417-11444` 有 zh-CN / zh-TW / ja-JP / ko-KR 四套「不能行首」「不能行尾」标点正则，并在 `TextService.shouldBreakByKinsokuShorui()` 里使用。这是少见的认真实现。
- **省略号 / 自动换行**：G2 轴组件默认挂了两条 label transform——`ellipsis`（`G2/src/component/axis.ts:261`，`minLength: 20`）和 `wrap`（`:264`，`wordWrapWidth: 100, maxLines: 3, recoveryWhenFail: true`）。
- **测量**：走 canvas `measureText` + 字体度量缓存（`fontMetricsCache`），CJK 全角字符宽度天然正确。
- **G2 自身无 CJK 特化逻辑**（全仓库 grep `cjk|chinese|east.?asian|fullwidth` 零命中），全部由 `@antv/g-lite` 兜住。

**实践中未发现 CJK 相关问题**——本插件大量中文标签，plan 的真机验证清单里没有一条 CJK 走形记录。

### 4.7 响应式

**引擎能力不足，本插件已自建两层补偿。**

- G2 的 `autoFit` **只绑 `window.addEventListener('resize')`**（`api/runtime.ts:496-510` 的 `_bindAutoFit`，300ms 防抖）。**它对容器自身的尺寸变化一无所知**——而 Obsidian 里侧边栏开合、分栏拖动、面板切换全都不触发 window resize。
- 更糟的是 G2 的 `sizeOf()` 在 `autoFit` 下量容器，**量到 0 就退回 640×480 默认画布**。阅读视图把段落虚拟化摘离（或 `display:none`）时正好量出 0，于是任何落在这个窗口里的渲染都会把画布改成 640 宽并**一直留着**。

本插件为此写了**两个 `ResizeObserver`**：

1. `ChartFigure`（约 40 行）：盯宿主宽度，150ms 防抖后重建；`lastWidth` 特意记录「上一次真正据以重建的宽度」而非「observer 上次看到的宽度」，否则摘离时报的 0×0 会把这次 resize 自己吃掉。
2. `Chart.tsx` 的 `attachSizeGuard`（约 20 行）：盯 G2 自己的容器，重新拿到布局盒时调 `forceFit()` 把画布量回来。

两处都必须显式判 `clientWidth === 0` 才不至于「亲手把好画布改成 640×480」。**这是引擎缺陷转嫁给使用方的成本，约 60 行。**

### 4.8 维护活跃度

**这是本次调研最不利的一项发现。**

#### G2 5.x 发版节奏

| 版本 | 日期 | 距上一版 |
| --- | --- | --- |
| 5.4.3 | 2025-11-05 | — |
| 5.4.4 | 2025-11-12 | +6 天 |
| 5.4.5 | 2025-11-21 | +9 天 |
| 5.4.6 | 2025-11-26 | +5 天 |
| 5.4.7 | 2025-12-09 | +12 天 |
| **5.4.8** | **2026-01-06** | +27 天 |
| **（至今）** | **2026-08-16** | **+221 天，无新版** |

2025 年 11-12 月还是 5-12 天一个 patch 的密集期，**2026-01-06 之后彻底停摆**。

`dist-tags` 实查：`{"v3-latest":"3.5.19","alpha":"5.3.4-alpha.0","beta":"5.3.6-beta.4","latest":"5.4.8"}`。

**本地克隆的 `antvis/G2` main 分支 `package.json` 版本号也是 5.4.8**——即**本项目已经在最新版上，无版本可升**。

#### issue 响应

G2 近 3 个月新建 issue 仅 **6 个**（其中 3 个是投毒事件报告）。对 2026-04-14 至 2026-07-22 的**全部** 10 个 open issue 逐一核查评论（排除 bot）：

- **8 个从未得到人工回复**
- 仅 2 个有维护者回复，均来自同一人，平均 **5.1 天**
- **这 2 次回复都发生在 2026-04 月底，此后 3.5 个月内 G2 无任何维护者 issue 回复**

**一条重要提醒**：所有 issue 都会被 `github-actions[bot]` 在 0 小时内自动回复一段 AI 生成内容，落款「G2 团队敬上 / 此回复由 AI 助手自动生成」。**这个 0 小时响应不能当作维护活跃度指标**——在投毒事件 issue #7402 里，该 bot 把恶意 `preinstall: bun run index.js` 载荷解释成「构建工具升级 / 统一 CI/CD 流程，对生产环境无影响」，**完全错误**。

#### v6 路线图：查不到

六个渠道全部为空：

| 渠道 | 结果 |
| --- | --- |
| branches | 只有 `master` / `v5`(默认) / `v3.5.x` / `v3.6.x` / `v4.0.x` / `v4.1.x` / `gh-pages`，**无 v6 分支** |
| milestones | 全部 closed，最新是 `5.0.3`，**无 open milestone** |
| issues（标题含 v6） | 唯一命中是 2021 年的 `ci: migrate husky to v6.0.0`（无关） |
| issues（RFC） | **total_count = 0** |
| discussions | 381 个 discussion 全是 Q&A 提问，v6 / roadmap 均 0 |
| org projects | 11 个，open 的 3 个与 G2 v6 无关 |

**替代信号（团队去向）**：G2 主分支最后一个 commit（2026-07-15，`9bc2ccf`）把官网公告栏改成了推广 **Sive**——AntV 新的 AI 驱动可视化创作平台（`site/.dumirc.ts:473-477`，`https://sive.antv.antgroup.com`）。同期还有 `chore: issue 自动回复模板添加 sive 指引`。组织层面 2026 年推进最勤的也是 AI 方向的 repo（Infographic 6306 star、mcp-server-chart 4315、GPT-Vis、chart-visualization-skills），而不是传统图表库。

**判读：团队重心已从 G2 库本身转向 AI 平台。**

#### 供应链投毒事件（2026-05-19）—— 选型必须知道

已独立复核（对比 registry 的 `time` 与 `versions` 字段找「幽灵版本」）：

- `@antv/g2` 的 `time` 里存在 **5.5.8（2026-05-19T01:56:41Z）** 与 **5.6.8（2026-05-19T02:06:01Z）** 两个版本号，但 `versions` 字典里没有——即**已被 unpublish**。
- 同样模式命中 **14 个 `@antv/*` 包**（g2 / g6 / x6 / s2 / l7 / f2 / g / g-canvas / g-svg / g-webgl / g2plot / scale / component / coord），每个各 2 个恶意版本，时间戳聚集在同两批。
- GitHub issue **#7394 确认存在且已关闭**，标题 `[SECURITY] @antv/g2 5.5.8 is a malicious release — maintainer compromise, credential stealer in preinstall script`（2026-05-19 创建）。恶意包在 `package.json` 注入 `"preinstall": "bun run index.js"`，载荷抓取 `ghp_`/`npm_`/`AKIA`/`xox*-`/SSH 私钥/JWT。
- 官方组织 README 已加公告：affected packages removed within 4 hours。
- **`@ant-design/*` scope 未受影响**（无幽灵版本）。
- **GitHub Advisory Database 至今未收录**（`advisories?ecosystem=npm&affects=@antv/g2` 返回 0 条）——意味着 `npm audit` **查不出来**。

**实务影响**：当前 npm 上已无恶意版本，装最新版安全。但 `^5.2.7` 这类 range 在 2026-05-19 当天会解析到 5.6.8。**需确认本项目 CI/本地在那天有没有跑过 `npm install`；若有，应清缓存并轮换凭据。** 同时这也说明：`@ant-design/plots` 用 `^5.2.7` 这种宽 range 引 G2，在上游维护者账号失守时没有任何保护——**建议无论是否换库，都把关键依赖锁死到精确版本**。

---

## 5. 留在 AntV 的改进空间

### 5.1 去掉 `@ant-design/plots` 直接用 `@antv/g2`

**能省多少**：见 §4.2 —— 引擎侧 277.6 KB（corelib）到 635.3 KB（手挑 library + html2canvas 打桩），整个插件产物可从 1620 KB 降到约 990 KB。

**要改多少代码**：

| 要改的 | 工作量 | 说明 |
| --- | --- | --- |
| `Chart.tsx`（85 行） | **重写约 60-80 行** | 从「渲染 plots 的 React 组件」改成「`useEffect` 里 `new Chart({container})` + `chart.options(spec)` + `chart.render()`」。现有的 `attachSizeGuard` 逻辑可原样保留 |
| `chart-tag-config.mjs` 的**配置形态** | **中等改动** | 现在写的是 plots 简写（`xField`/`yField`/`colorField`/`chartType: "DualAxes"`），G2 原生要写 `encode: {x,y,color}` + `children`。**这一步反而是净收益**——直接写 G2 spec 就**绕开了整个转换层**，§3 末尾的死配置和 §4.5 的「配置对象不幂等」两个陷阱**从根上消失** |
| PNG 导出 | **+5 行** | 自己取 canvas 调 `toDataURL` |
| `register()` 导入源 | **1 行** | 从 `@ant-design/plots` 改成 `@antv/g2`。**顺带修掉一个隐患**：现在必须从 plots 导入是因为「plots 打包了自己那份 g2，两份 g2 各有一张形状注册表」——直接用 g2 后只有一份，这条约束消失 |
| `preact` 依赖 | **可能可去掉** | plots 的 peerDependency 是 react/react-dom（项目现在用 preact/compat 顶替，24.3 KB）。若图表层不再需要 React，视其他组件是否还用得到 |

**风险点**：`combo` / `combo-dual-axis` 现在依赖 plots 的 `DualAxes` 组件做 children 组装与 scale key 分组，改写时这 116 行是主要工作量，需要重新验证「共用 x scale 的 guide 合并」「color scale range 拼接」两处行为。

**净判断**：**这是一次划算的改造**——省 40% 体积，同时消灭两个已知陷阱类型。但它是**几百行的重构 + 全量真机回归**，不是顺手的事。

### 5.2 已知「做不到」的，最新版是否已解决

**全部没有，且不会有。** 因为**本地克隆的 G2 main 分支版本号就是 5.4.8，与项目正在用的完全一致**——没有更新的版本可升。逐条在最新源码上复核：

| 已知限制 | 最新版状态 | 源码依据 |
| --- | --- | --- |
| 视图级 `labelTransform` 不生效 | **仍然如此** | `G2/src/runtime/plot.ts:1188` 仍是 `const { markState, labelTransform } = view;`；plots `VIEW_OPTIONS` 仍不含该键 |
| 轴标签背后无底色 | **仍然如此** | `@antv/component@2.1.11` 的 `esm/ui/axis/` 下 grep `background` **零命中**；`backgroundFill` 只在 legend / indicator / timebar / select |
| 抽稀无按项豁免 | **仍然如此** | `esm/ui/axis/overlap/autoHide.js:14` 仍只有 `keepHeader` / `keepTail` |
| 内置 `line` 图例标记是竖线 | **仍然如此** | `G2/src/utils/marker.ts:114-118` 仍是 `M x,y+r → L x,y-r` |
| 内置 `hyphen` 走不通 | **仍然如此**（横杠形状对，但受反向缩放） | `marker.ts:154-158` 形状正确，但 `:160` 的 `hyphen.style = ['stroke','lineWidth']` 触发 `scaleToPixel` |
| `rangeX` 在折线图上宽度恒 0 | **仍然如此** | `G2/src/mark/range.ts:14` 仍是 `scale.getBandWidth?.(scale.invert(+C1[i])) \|\| 0` |
| `autoFit` 不响应容器变化 | **仍然如此** | `G2/src/api/runtime.ts:496-510` 仍只 `window.addEventListener('resize', ...)` |

**结论：这批坑不是「等一个版本就能修」的，是「上游已经不发版了」。**

### 5.3 有没有官方插件 / 扩展覆盖短板

**基本没有可用的。**

- `@antv/g2-extension-plot`：官方扩展，但只补图型（旭日图等），**不补上述任何一条呈现层短板**。而且它已被 plots 强制拖入（占 10.3 KB），换直连 g2 后可以整包去掉。
- `antvis/g2-extensions` repo：**最后 push 2025-09-15**，近一年无更新。
- `antvis/component`（轴/图例组件库）：**最后 push 2026-05-18**，npm 最后发版 2025-11-21。轴标签底色和抽稀豁免这两条要在这里改，**上游无动静**。
- **没有任何第三方社区扩展**填补这些空白（查不到）。

### 5.4 无论换不换都该做的两件事

1. **`html2canvas` 打桩** —— 一行 esbuild alias，**省 203.7 KB（12.6%）**，零代码改动，零行为变化（已确认导出链路不经过它）。这是本次调研 ROI 最高的一条。
2. **锁死依赖版本** —— 鉴于 §4.8 的投毒事件与 `^5.2.7` 这类宽 range，把 `@antv/*` 锁到精确版本（或至少确认 `package-lock.json` 已提交且 CI 用 `npm ci`）。

---

## 6. 三个最大优势 / 三个最大短板

### 优势

1. **能力上限确实高，几乎没有「引擎办不到」的墙**。十六项里只有 2 个子项（轴标签底色、抽稀豁免）是引擎真做不到，而且都找到了可接受的变通（记号改画在绘图区里）。图形语法（mark + transform + encode + scale + coordinate 组合）的表达力比配置式引擎高一个量级——`annotations` 挂 `rangeX`/`lineX` 这种「临时加一个不参与数据映射的图层」在配置式引擎里往往是没有出口的。

2. **CJK 支持是真的做过功课**。`@antv/g-lite` 实现了四语种完整禁则处理（Kinsoku Shori），轴标签自带 ellipsis + wrap transform。本插件大量中文标签，真机验证清单里没有一条 CJK 走形记录——**这一条在选型对比里应当作为 AntV 的正面基准，另外两家需要专门验证**。

3. **`@antv/g2` 可完全独立使用，且分级 library 设计良好**。无 peerDependencies、不依赖 React、`litelib`/`corelib`/`plotlib`/`graphlib`/`geolib` 分级清晰，按需引入实测能省 40% 体积。**架构上留了出路**——这是 §5.1 那次改造可行的前提。

### 短板

1. **上游已经停止维护，且没有 v6 路线图**。G2 最新版 5.4.8 发布 221 天前，仓库近 90 天 4 个 commit 全是站点公告，近 10 个 open issue 8 个无人回复且最后一次维护者回复在 3.5 个月前，`@antv/coord` 996 天未发版，`@antv/g` 渲染底座近 90 天 0 commit，`@ant-design/plots` 所在仓库自 2026-01-29 起 0 commit。六个渠道查不到任何 v6 计划，团队重心公开转向 AI 平台 Sive。**这意味着 §5.2 那批已知限制永远不会被修，未来发现的任何新问题也只能自己扛。** 附带一条风险：2026-05-19 的供应链投毒事件说明维护者账号安全边界不牢，而 GitHub Advisory 至今未收录、`npm audit` 查不出来。

2. **开箱即用程度差 —— 这正是用户诉求的核心**。十六项里**内置默认行为 0 项**，一个配置项只有 3 项，**10 项要自己实现**。用户原话是「数字放在哪儿、数字的效果、水平碰撞渲染、自适应等等，这些东西你都不用去考虑」，而实际情况恰好相反：数值标签描边要发明双层画法（26 行 + 26 行注释），图例横杠要注册自定义形状并反解缩放公式（25 行 + 12 行注释），y 轴留白要自己算并自己接刻度算法（41 行），单位位置只能退出引擎改走 DOM，连响应式都要自建两个 `ResizeObserver`（约 60 行）——因为 `autoFit` 只监听 window resize。整个 `chart-tag-config.mjs` **33% 是注释，其中 174 行专门记录踩坑与「为什么不能那样写」**。

3. **分库架构使「一家覆盖全」的代价很高**。统计图 G2、关系图 G6、流程图 X6、透视表 S2、地图 L7、移动端 F2——**六个库分裂成四套底层引擎**（G2/G6/S2 共用 `@antv/g` 但版本各不相同，X6 用原生 SVG，L7 自研 WebGL，F2 用 f-engine），**五种互不兼容的 API 范式，五套互不兼容的主题格式（X6 干脆没有主题系统）**。现在这套跟随 Obsidian 明暗主题的注入逻辑是为 G2 一家写的，加任何第二种图表类型都得重写一遍。而且日历热力图、时间线、甘特图这三种常见类型**全家族零内置实现**。

---

## 7. 不确定的地方

明确标注，未做推测。

1. **`@antv/g2` + `corelib` 的真实业务体积未实测**。§4.2 的 A/B/C/D 四个变体测的是**引擎入口**（`import` 后 `console.log`），不含插件的 393 行图表配置代码，也未实际跑通渲染。**「整个插件产物可望降到约 990 KB」是按引擎侧差值推算的，不是实测的完整构建**。要确认必须真做一次 §5.1 的改造。

2. **§5.1 改造中 `DualAxes` 那 116 行的重写难度未验证**。plots 的 `DualAxes` 做了 children 组装与 scale key 分组，改写成 G2 原生 spec 后「共用 x scale 的 guide 合并」「color scale range 拼接」两处行为是否等价，**没有实测**，只能说是主要风险点。

3. **`html2canvas` 打桩后的运行时安全性只做了静态分析**。已确认导出链路走原生 `canvas.toDataURL()`、不经过 `ImageExporter`，但**没有真机跑过一次导出**来验证打桩不会在别处触发。落地前应真机验证。

4. **G2 停更是「暂停」还是「终止」，无法判断**。仓库未 archive、README 无 deprecated 声明、包未标记 deprecated——**没有任何官方表态**。221 天无发版是事实，但这是重心转移期的暂停还是永久终止，**查不到依据**。（可参考的先例：F2 已事实停维 278 天，同样没有任何官方声明。）

5. **Sive 平台与 G2 的关系不明**。只知道 G2 官网公告栏在 2026-07 改成了推广 Sive，issue 自动回复模板也加了 Sive 指引。**Sive 是基于 G2 构建、会反哺 G2，还是另起炉灶取代 G2，查不到。**

6. **`@antv/g2-extension-plot`、`@antv/l7plot`、`@antv/layout`、`@antv/hierarchy` 未克隆**，其完整能力无法从本地源码核实。§2 中涉及它们的结论仅基于 G2/X6/L7 仓库内对它们的 import 与文档引用。

7. **投毒事件对本项目的实际影响未核查**。已确认 npm 上恶意版本已清除，但**没有检查本项目的 `package-lock.json` 或 CI 记录**来确认 2026-05-19 当天是否跑过 `npm install`。这一条需要项目侧自行核实。

8. **任务书给出的 d3 模块体积（d3-geo 14KB 等）与本报告实测值（28.4KB 等）不一致**，口径差异原因未查明。本报告数字来自 esbuild metafile 的 `bytesInOutput`（minify 后计入产物的实际字节）。
