# Apache ECharts 选型调研

调研对象：Apache ECharts **6.1.0**（源码 checkout，commit `30076ae`，2026-08-04；npm `echarts@6.1.0` 发布于 2026-05-19）
调研日期：2026-08-16
取证方式：源码逐行核实为主，实测打包为辅，官方文档只在源码无法回答时引用

---

## 一句话结论

十六项里有十四项是「内置或一个配置项」，按需引入后打包产物比现在的 `@ant-design/plots` **小约 1MB**（实测 1.57MB → 0.58MB），发布产物是 ES3 目标编译、无 ES2017 风险，v6 新增的 `chart.setTheme()` 让主题切换不必销毁重建 —— 对这个插件而言，ECharts 是一次「代码变少、体积变小、能力变多」的迁移，唯一要自己扛的是「CSS 变量 → 颜色值」的桥接（这一层现在也躲不掉）。

---

## 1. 生态版图

### 1.1 包清单

| 包名 | 干什么 | 维护状态（最新版 · 发版时间 · 距今） | 是否必需 |
| --- | --- | --- | --- |
| `echarts` | 主库，23 个 series + 28 个 component 全在里面 | 6.1.0 · 2026-05-19 · 3 个月前 | ✅ **唯一需要显式装的包** |
| `zrender` | Canvas/SVG 渲染底座，ECharts 的图形层 | 6.1.0 · 2026-05-04 · 3.5 个月前 | ✅ 作为 `echarts` 的 dependency 自动装 |
| `tslib` | TypeScript 运行时 helper | 2.3.0（版本锁死） | ✅ 自动传递依赖 |
| `echarts-gl` | 3D 图 / 地球 / GL 加速散点 | 2.1.0 · 2026-05-28 · 2.6 个月前 | ❌ 只有要 3D 才装 |
| `echarts-wordcloud` | 词云 series | 2.1.0 · **2022-11-24 · 3 年 9 个月前** | ❌ 事实停维护，peer 只声明 `echarts ^5.0.1` |
| `echarts-liquidfill` | 水球图 | 3.1.0 · **2021-09-18 · 近 5 年前** | ❌ 停维护 |
| `echarts-stat` | 回归 / 直方图 / 聚类等统计变换 | 1.2.0 · **2020-11-03 · 5 年 9 个月前** | ❌ 停维护 |
| `echarts-graph-modularity` | 关系图社区发现布局 | 2.1.0 · **2021-10-15 · 近 5 年前** | ❌ 停维护 |
| `echarts-extension-amap` / `-gmap` | 高德 / Google 地图坐标系 | 1.12.0 · 2024-01 / 1.7.0 · 2024-09 | ❌ **社区包**（`plainheart/`，非 apache/ecomfe） |
| `vue-echarts` | Vue 3 封装 | 8.1.0 · 2026-08-07 · 9 天前 | ❌ 官方（ecomfe），活跃 |
| `echarts-for-react` | React 封装 | 3.0.6 · 2026-01-21 | ❌ **社区包**（`hustcc/`） |
| `@types/echarts` | 类型定义 | 5.0.0 · npm 上已标记 **deprecated** | ❌ **绝不要装**，主包自带 `types/dist/*.d.ts` |

### 1.2 双组织结构（容易踩空的一点）

ECharts 本体捐给了 Apache 基金会，扩展生态没有。`apache` 组织下 13 个 repo 全是**主库 + 文档 / 工具站**（echarts、echarts-doc、echarts-examples、echarts-handbook、echarts-website、echarts-www、echarts-theme-builder、echarts-mcp、echarts-custom-series、echarts-from-mermaid、echarts-bot、echarts-bar-racing、echarts-wordcloud-generator），全部非 archived，主库最后 commit 2026-08-04。

所有运行时扩展（**含 zrender**）都在 `ecomfe`（百度前端团队）下，不受 ASF 治理。

⚠️ **陷阱**：`ecomfe` 下的 wordcloud / liquidfill / stat / graph-modularity 的 GitHub `pushed_at` 都显示 2024-03-12，看着像还活着，但逐个查 commit 全是一次性批量刷 README。真实代码活动分别停在 2022-11 / 2021-09 / 2021-06 / 2021-10。**别拿 `pushed_at` 判断这几个包的死活。**

### 1.3 装一个包能得到什么

`package.json` 的 `exports["."]` → `./index.js`，而 `build/pre-publish.js:119` 显示 `index.js` 就是 `src/echarts.all.ts` 编译后重命名的。`src/echarts.all.ts` 已 `use()` 了 2 个 renderer + 23 个 chart + 28 个 component + 5 个 feature。

**柱 / 折线 / 饼 / 散点 + 双轴组合 + 图例 + tooltip + markArea/markLine + 数据标签 + PNG 导出 —— 全部在 `echarts` 一个包里，一行依赖搞定。** PNG 导出两条路都在主包：程序化的 `chart.getDataURL()`（`src/core/echarts.ts:969`）和 toolbox 的 `saveAsImage` feature（`src/component/toolbox/install.ts:37`）。

`src/` 下 785 处 `from 'zrender/src/...'`，没有任何其他第三方运行时导入。

---

## 2. 图形类型覆盖

内置 series 共 23 个（`src/chart/`）：line、bar、pie、scatter、effectScatter、radar、map、tree、treemap、graph、chord、gauge、funnel、parallel、sankey、boxplot、candlestick、lines、heatmap、pictorialBar、themeRiver、sunburst、custom。

| 图形类型 | 是否支持 | 在哪个包 | 额外依赖 | 限制 |
| --- | --- | --- | --- | --- |
| 柱 / 折线 / 饼 / 散点 | ✅ 原生 | 主包 `src/chart/{bar,line,pie,scatter}` | 无 | 无 |
| 关系图 / 网络图 | ✅ 原生 | `src/chart/graph/` | 无 | 布局只有 `none` / `force` / `circular`（`GraphSeries.ts:160`）。边可带箭头（`edgeSymbol`）和标签 |
| 流程图（自动布局） | ⚠️ 部分 | `graph` 或 `custom` | 无 | **没有 DAG 分层布局**。`layout:'none'` 要自己算每个节点坐标；无正交折线避障 |
| 思维导图 | ⚠️ 近似 | `src/chart/tree/` | 无 | Reingold-Tilford 布局，支持折叠展开；但**连线不能带箭头也不能带标签**，严格单根树，不能跨枝连线、不能左右双向分叉 |
| 树图 | ✅ 原生 | `tree` / `treemap` / `sunburst` | 无 | 无 |
| 甘特图 | ❌ 无原生 | 只能 `custom` | 无 | `src/chart/` 下无 `gantt` 目录；全仓 grep 唯一命中是 `CustomSeries.ts:438` 指向官方 example 的注释。官方 issue #19579 开于 2024-01，至今 open |
| 桑基图 | ✅ 原生 | `src/chart/sankey/` | 无 | 无 |
| 漏斗图 | ✅ 原生 | `src/chart/funnel/` | 无 | 无 |
| 地图 | ⚠️ 引擎有，数据没有 | `src/component/geo/` + `src/chart/map/` | **必须自备 geoJSON/SVG** | v5 起移除内置地图数据；未 `registerMap` 直接用会抛错。中国地图另有审图号合规要求 |
| 透视表 / 交叉表 | ⚠️ 只能画静态格子 | v6 新增 `src/component/matrix/` | 无 | 支持多层嵌套表头 + `mergeCells`，但**要逐格枚举数据**，无排序筛选、无虚拟滚动、非 DOM `<table>`（不可选中复制） |
| 时间线 | ⚠️ 语义不同 | `src/component/timeline/` | 无 | 它是**多份 option 快照的播放控制器**，不是「事件时间线图」 |
| 仪表盘 | ✅ 原生 | `src/chart/gauge/` | 无 | 无 |
| 词云 | ❌ 无内置 | `echarts-wordcloud` | 需装 | 已停维护，未声明支持 v6 |
| 日历热力图 | ✅ 原生 | `src/coord/calendar/` + `heatmap` | 无 | heatmap **强制要求 visualMap**（`HeatmapView.ts:114` 直接 throw） |
| 箱线 / K 线 / 雷达 / 平行坐标 / 旭日 / 主题河流 / 弦图 | ✅ 全部原生 | 主包 | 无 | chord 是 v6 新增 |
| 3D | ❌ 无内置 | `echarts-gl` | 需装 | 唯一适配 v6 的扩展（2.1.0 声明 `^6.0.0`） |
| pictorialBar / lines / custom | ✅ 原生 | 主包 | 无 | v6 新增 `registerCustomSeries()`，可把 custom 封装成具名可复用 series |
| thumbnail（v6 新） | ✅ | `src/component/thumbnail/` | 无 | 缩略图 minimap，源码注释写明「目前只有 graph 支持」 |

### 做不到、必须另找库的

1. **甘特图** —— 无原生 series，custom 等于自己实现一个甘特引擎。
2. **自动布局的流程图 / DAG 图** —— `src/chart/graph/install.ts` 只注册 simple / circular / force 三个 layout handler。
3. **真正的数据表格 / 透视表** —— 没有 table series；matrix 只能画静态格子，`dataZoom` 不支持 matrix。
4. **完整形态的思维导图** —— tree 的边没有箭头和标签，不能双侧分叉。
5. **任何 3D** —— 必须 `echarts-gl`。
6. **词云、液态填充** —— 扩展生态事实停摆。
7. **地图数据本身** —— 引擎有 geo 坐标系，零地图数据。
8. **维恩图、瀑布图、子弹图** —— `src/chart/` 下无对应目录。

**对这个插件的意义**：主线（柱 / 折线 / 饼 / 散点 / 组合 / 日历热力 / 桑基 / 漏斗 / 仪表盘）零依赖全覆盖。三个硬缺口（甘特、自动布局流程图、数据表格）本来也不在这个插件的路线上。

---

## 3. 十六项对照

> 结论档位：**内置默认行为** / **一个配置项** / **少量代码（<10 行）** / **要自己实现** / **做不到**

| # | 事项 | 结论 |
| --- | --- | --- |
| 1 | 折线粗细可配 | 一个配置项 |
| 2 | 数据标签防碰撞：错开优先、隐藏兜底 | **一个配置项（两者可同时生效）** |
| 3 | 组合图去掉重复右轴 | 一个配置项 |
| 4 | 堆叠柱数字在色块正中 | 居中：内置默认；薄段隐藏：一个配置项（语义有偏差） |
| 5 | 图例标记尺寸与形状 | 一个配置项 + 一处硬编码要绕 |
| 6 | 图例顶部居中 | 一个配置项 |
| 7 | 单位文字放置 | 一个配置项 |
| 8 | tooltip 排版 / 提亮 / 描边 / 边框 | 排版边框：一个配置项；**文字描边：少量代码（走 CSS）** |
| 9 | 标记特定 x 值 | 一个配置项 ×2 |
| 10 | y 轴 8% 留白 + 刻度凑整 | 凑整：内置默认；留白：一个配置项（口径有偏差） |
| 11 | 主题跟随 + 切换重建 | **少量代码（v6 的 `setTheme` 不必销毁重建）** |
| 12 | PNG 导出 | 一个配置项（官方 API，但别用 toolbox 那条路） |
| 13 | 数值标签描边 | **内置默认行为（描边天然在文字背后）** |
| 14 | 负值标签方向翻转 | 一个配置项（自动按符号翻） |
| 15 | 悬停列背景带 / 竖线 | 竖线：内置默认；背景带：一个配置项 |
| 16 | 双轴组合图 | 一个配置项 |

**十六项里「要自己实现」0 项、「做不到」0 项**；14 项落在「内置默认」或「一个配置项」，只有 tooltip 的文字描边和主题跟随需要写少量代码（各 <10 行）。

### 三处重点核实

#### A. `hideOverlap` 与 `moveOverlap` 能同时生效 —— 能，而且顺序正是「先错开，错不开再隐藏」

这一条决定了整个第 2 项的结论，我逐行核实过：

```ts
// src/label/LabelManager.ts:442-469
layout(api) {
    const labelList = [...];                                    // :446-451 全部候选标签

    const labelsNeedsAdjustOnX = filter(labelList, i => i.layoutOption.moveOverlap === 'shiftX');  // :453
    const labelsNeedsAdjustOnY = filter(labelList, i => i.layoutOption.moveOverlap === 'shiftY');  // :456

    shiftLayoutOnXY(labelsNeedsAdjustOnX, 0, 0, width);         // :460  ← 先错开
    shiftLayoutOnXY(labelsNeedsAdjustOnY, 1, 0, height);        // :461

    const labelsNeedsHideOverlap = filter(labelList, i => i.layoutOption.hideOverlap); // :463
    restoreIgnore(labelsNeedsHideOverlap);                      // :467
    hideOverlap(labelsNeedsHideOverlap);                        // :468  ← 再隐藏
}
```

两次 `filter` 作用在**同一个 `labelList`** 上，互不排斥。同时写 `moveOverlap` 和 `hideOverlap` 的标签会先后进入两个流程。`src/util/types.ts:1528-1543` 的类型注释把这个契约写死了：

> "If move the overlapped label. If label is still overlapped after moved. It will determine if to hide this label with `hideOverlap` policy."

`hideOverlap` 的实现（`src/label/labelLayoutHelper.ts:522-576`）用的是**位移后的** rect（`ensureLabelLayoutWithGeometry`），所以顺序确实是「错开 → 复测 → 隐藏」。

```js
labelLayout: { moveOverlap: 'shiftY', hideOverlap: true }
```

**坑**：
- `moveOverlap` 的类型声明里有 `'shuffleX'` / `'shuffleY'`（`types.ts:1537-1538`），但 `layout()` 只 filter `'shiftX'` / `'shiftY'`，全仓再无 shuffle 实现 —— **这两个值写了等于没写**。
- 隐藏的优先级 = 宿主图元的面积（`LabelManager.ts:267` `priority: hostRect.width * hostRect.height`），大柱子的标签优先保留。这个策略不可配。
- `labelLayout` **必须逐 series 写**：`LabelManager.ts:306-313`，`seriesModel.get('labelLayout')` 为空就 `return`，该 series 的标签根本不进 labelList。堆叠柱的各段是不同 series，漏写一个就永远不参与避让。
- `installLabelLayout` 已由 `echarts/core` 默认注册（`src/export/core.ts:24-29`），不用手动 `use()`。

#### B. `markArea` 在类目轴上标记某一列 —— 柱状图自动对齐整格，折线图不会

`src/chart/bar/BaseBarSeries.ts:97-180` 的 `getMarkerPosition(value, dims, startingAtTick)`：类目轴时改用 `axis.getTicksCoords()` 取**刻度线坐标**，并对 `x1`/`y1` 端做 `targetTickId += 1`（除非 `axisTick.alignWithLabel`）。`MarkAreaView.ts:174-197` 在 series 提供了 `getMarkerPosition` 时优先走它。

所以在 **bar series** 上，`[{xAxis:'三月'},{xAxis:'三月'}]` 精确覆盖整个类目带，宽度全自动，不用碰坐标。

⚠️ `grep -rn getMarkerPosition src/` 全仓只有两处：`BaseBarSeries.ts:97`（实现）和 `Series.ts:124`（抽象声明）。**line series 没有这个方法**，`MarkAreaView.ts:200-204` 会退回 `coordSys.dataToPoint(pt, true)` —— 落在类目**中心点**，单类目 markArea 宽度为 0。折线图要色带，得挂到同一 grid 的某个 bar series 上，或改用 `markLine`。

其他要点：`MarkAreaModel.ts:82-107` 默认 `z: 1`（bar 是 2、line 是 3），色带天然在图形下面；但默认 `label.show: true`，不要就显式关掉。markArea 是 **series 的子项**，顶层 `option.markArea` 只是启用开关，没有数据入口。

#### C. 标签描边 —— 内置，且描边确实在文字背后

`src/label/labelStyle.ts:550` 把 `textBorderColor` 映射成 `textStyle.stroke`，`:592-594` 把 `textBorderWidth` 映射成 `textStyle.lineWidth`（另有 `textBorderType` → `lineDash`、`textBorderDashOffset` → `lineDashOffset`）。

关键是绘制顺序。zrender 的 canvas 文字绘制（`zrender/src/canvas/graphic.ts:342-356`）：

```js
if (style.strokeFirst) {
    ctx.strokeText(...);   // 先描边
    ctx.fillText(...);     // 后填充，盖住内半边
} else {
    ctx.fillText(...);
    ctx.strokeText(...);   // 描边啃进字形
}
```

而 `strokeFirst` **默认就是 true**：`zrender/src/graphic/TSpan.ts:35` 的 `DEFAULT_TSPAN_STYLE` 里 `strokeFirst: true`；`zrender/src/graphic/Text.ts:630-632` 更是显式写死并附注释 `// Fill after stroke so the outline will not cover the main part.`。SVG renderer 走 `paint-order: stroke`（`zrender/src/svg/mapStyleToAttrs.ts:76`），效果一致。

```js
label: { show: true, textBorderColor: '#fff', textBorderWidth: 2 }
```

这正是「文字周围一圈光晕、压在图形上也看得清」。**注意：这条只对 series label / axisLabel / graphic 文字成立；tooltip 是例外，见第 8 项。**

### 逐项明细

**1. 折线粗细可配 —— 一个配置项**

```js
series: [{ type: 'line', lineStyle: { width: 3 } }]
```

依据：默认 `lineStyle: { width: 2, type: 'solid' }`（`src/chart/line/LineSeries.ts:180-181`）；`src/chart/line/LineView.ts:639` `seriesModel.getModel('lineStyle')`，`:832-834` `polyline.useStyle(defaults(lineStyleModel.getLineStyle(), ...))`；`src/model/mixin/lineStyle.ts:26` 把 option 的 `width` 映射成 canvas 的 `lineWidth`。

⚠️ **只在 series 级生效**。`data: [{value, lineStyle}]` 改不了折线粗细（整条线是一个 polyline）。另外 `emphasis.lineStyle.width: 'bolder'` 是特殊字符串，走 `LineView.ts:844` 的 +1 分支，不是数值。

**2. 数据标签防碰撞 —— 一个配置项**

```js
series: [{ type: 'bar', label: { show: true }, labelLayout: { moveOverlap: 'shiftY', hideOverlap: true } }]
```

依据见上文 A。

**3. 组合图去掉与左轴重复的右轴 —— 一个配置项**

```js
yAxis: [{}, { show: false }]     // 只隐藏视觉，scale 照常参与计算
```

依据：`src/component/axis/CartesianAxisView.ts:57-59` 的 `if (!shouldAxisShow(axisModel)) return;`（`shouldAxisShow` 在 `src/coord/axisHelper.ts:287-289` 读 `getShallow('show')`）只挡住 view 的渲染 —— 轴线、刻度、标签、轴名、splitLine、splitArea 一次全没。而 `Grid.ts:146-174` 的 `updateAxisTicks` 与 `show` 无关，**scale 照常计算**，折线仍正确映射到隐藏的右轴。附带好处：隐藏的轴不参与 margin 计算（`Grid.ts:866`），grid 会把右侧空间收回来。

粒度更细的话，`axisLine.show`（`AxisBuilder.ts:679-688`）、`axisTick.show`（`:1243-1252`）、`axisLabel.show`（`:1355,1360`）各管各的。

如果目的是「两轴刻度一致所以右轴多余」，更好的做法是加 `alignTicks: true` 让两轴刻度线真正对齐，再整体隐藏：

```js
yAxis: [{}, { alignTicks: true, show: false }]
```

⚠️ `alignTicks` 在 `axisDefault.ts` 里**没有默认值**（全 src 只有类型声明和读取处），即默认 false。两个失效条件都在 `Grid.ts:733-741`：轴不是 interval/log（category 轴无效），或该轴设了 `interval`。**只写 `show:false` 不写 `alignTicks`，两轴刻度数可能不同，柱和折线的相对高低会误导读者。**

**4. 堆叠柱的数字在各自色块正中间 —— 居中是内置默认；薄段隐藏是一个配置项，但语义有偏差**

```js
series: [
  { type:'bar', stack:'t', label:{show:true}, labelLayout:{hideOverlap:true} },
  { type:'bar', stack:'t', label:{show:true}, labelLayout:{hideOverlap:true} }
]
```

- 居中：`src/label/labelStyle.ts:354-355` —— normal 态不写 `position` 时默认就是 `'inside'`；`src/chart/bar/BarView.ts:1031-1041` 每个 data item 各自 `setLabelStyle(el, ...)`，`el` 是**该段自己的 Rect**；zrender 的 `calculateTextPosition` 对 `'inside'` 取 `x += width/2, y += halfHeight`，几何正中。
- 字色自动对比：inside 位置走 `getInsideTextFill()`，深底白字 / 浅底黑字，中文标签默认可读。
- ⚠️ **「段太薄就隐藏」在源码里不存在**。`BarView.ts` 里唯一给 `el.ignore` 赋值的两处（`:313`、`:433`）值都是 `isClipped`（超出坐标系被裁剪），与标签尺寸无关。全仓 `autoOverflowArea` 只有 matrix 组件在用，bar 完全不走那条自动收纳路径。
- 内置兜底是 `hideOverlap`，它判的是**标签矩形之间**相交，不是标签 vs 柱体。堆叠柱场景下恰好可用：优先级 = 宿主面积（`LabelManager.ts:267`），薄段的标签压到厚段的标签就被隐藏。
- 要像素级精确的「比这段矮就不显示」，用 `labelLayout` 回调（同时拿得到 `rect` = 该色块和 `labelRect` = 标签自身）：

  ```js
  labelLayout: p => ({ fontSize: p.rect.height >= p.labelRect.height + 4 ? 12 : 0 })
  ```

  `LabelLayoutOption`（`src/util/types.ts:1516-1569`）**没有 `show` / `ignore` 字段**，`fontSize: 0` 是回调内唯一的隐藏手段。
- ⚠️ 被 `hideOverlap` 藏起来的标签在 emphasis 态会重新出现（`labelLayoutHelper.ts:530-538`），鼠标悬停时会突然冒字。

**5. 图例标记尺寸与形状 —— 一个配置项 + 一处硬编码要绕**

```js
legend: {
  top: 0, left: 'center',
  itemWidth: 12, itemHeight: 12,
  icon: 'rect',                            // 默认 12×12 方块
  textStyle: { padding: [0, 0, 0, -1] },   // 硬编码 5px → 4px
  data: [
    { name: '柱系列' },
    { name: '折线系列', icon: 'path://M0,0L12,0L12,4L0,4Z' }   // 12 宽 4 高横杠
  ]
}
```

- `itemWidth` / `itemHeight` 是**全局的，不支持 per-item**：`LegendView.ts:398-399` 从 legendModel 读，对 `src/component/legend/` 整目录 grep 没有任何一处从 legendItemModel 读。默认 25×14（`LegendModel.ts:470-471`）。
- 12×12 方块精确成立：`createSymbol` 的内置符号分支（`util/symbol.ts:366-376`）直接用 `width: w, height: h`，`keepAspect` 对内置符号不生效。
- 折线的 12×4 横杠必须用 `path://`，但**不需要写代码**。这里两轮调研结论相左，我在源码里判定过：`symbolKeepAspect` 是 **per-item 读取**（`LegendView.ts:403` 从 legendItemModel 读）且默认 `true`（`LegendModel.ts:473`）；`createSymbol` 的 `path://` 分支走 `makePath(..., keepAspect ? 'center' : 'cover')`（`util/symbol.ts:358-364`）→ `graphic.ts:184-198` → `centerGraphic`（`:240-264`）。代入 12×4 的 path bbox 和 12×12 的框：`aspect = 12/4 = 3`，`width = rect.height * aspect = 36 > rect.width = 12` → 取 `width = 12, height = 12/3 = 4`，垂直居中。**结论：同一个 legend 里「柱是方块、折线是横杠」是能做到的，不必拆成两个 legend 组件**（对内置符号确实做不到 —— `itemWidth/itemHeight` 全局这一层没法绕）。
- per-item `icon` 生效的前提：`LegendView.ts:422-424` 只有在没显式设 `icon`（或设成 `'inherit'`）时才走 series 自己的 `getLegendIcon`。line series 默认图标是「横线 + 圆点」（`LineSeries.ts:236-281`），显式设 `icon` 会完全绕开它。
- ⚠️ **色块↔文字间距是硬编码 5px**：`LegendView.ts:455` `const textX = itemAlign === 'left' ? itemWidth + 5 : -5;`（已复核，确实是字面量，无配置项）。要 4px 只能靠负 padding —— `legend.textStyle.padding` 会被 `labelStyle.ts:527-531,654-660` 拷进 textStyle，zrender 的左对齐布局是 `x + textPadding[3]` 纯加法，负值可用。**副作用**：padding 计入 boundingRect，影响 `itemGap` 排布和 hitRect 宽度。
- ⚠️ `formatter` 虽然类型上像 per-item 可用，但 `LegendView.ts:458` 是 `legendModel.get('formatter')` —— **per-item formatter 无效**。

**6. 图例位置顶部居中 —— 一个配置项**

```js
legend: { top: 0 }     // left: 'center' 已是默认，可省
```

依据：`left: 'center'` 确实是默认（`LegendModel.ts:457`），`util/layout.ts:352-356` 的 `case 'center': left = containerWidth/2 - width/2 - margin[3]`。

⚠️ **v6 的默认位置是底部，不是顶部**：`LegendModel.ts:460` 是 `bottom: tokens.size.m`（= 15），而 `:459` 的 `// top: 0` 是**被注释掉的 v5 旧默认值**。从 v5 迁移过来、依赖「默认在顶部」的 option，在 v6 下图例会跑到底部。

只写 `top: 0` 能不能清掉默认的 `bottom: 15`：能。`LegendModel.ts:251-261` 声明 `layoutMode = { type:'box', ignoreSize:true }`，`util/layout.ts:711-720` 在 `ignoreSize` 分支看到 newOption 有 `top` 就把 `bottom` 置 null，不会打架。

**7. 单位文字的放置位置 —— 一个配置项**

```js
yAxis: [
  { name: '单位：万元', nameLocation: 'end', nameGap: 12, nameRotate: 0,
    nameTextStyle: { align: 'left', color: '#888', fontSize: 11 } },
  { name: '单位：%', nameLocation: 'end', position: 'right' }
]
```

- `nameLocation` 默认就是 `'end'`（`src/coord/axisDefault.ts:34,47`，`nameGap: 15`），对 y 轴就是「轴顶端」。定位数学在 `AxisBuilder.ts:855-871`；旋转走 `:891-893` → `:1022-1055` 的 `endTextLayout`，`nameRotate` 未设时 `rotationDiff = 1.5π` 与 group 的 `π/2` 抵消 → **屏幕上是水平的**，`:1036-1039` 给出 `textAlign:'center'` + `verticalAlign:'bottom'` → **文字坐在轴顶正上方居中**。开箱即用就是想要的效果。
- 对比：`nameLocation: 'middle'` 才会自动 90 度竖排（`AxisBuilder.ts:883-888`，`nameRotate` 缺省取 `cfg.rotation`）。
- 双 y 轴各自的 name 完全独立（`axisModelCreator.ts:61-132` 是普通多实例 ComponentModel），`Grid.ts:1057-1061` 还对多个平行轴的 name 做了防重叠。
- 备选：`graphic` 组件（完全自由定位，**且它的 `style.stroke`/`lineWidth` 文字描边是支持的**）、`title.subtext`。

⚠️ 三个死角：
- `nameTextStyle` 的 `width` / `overflow` / `ellipsis` **会被 `AxisBuilder.ts:922-924` 硬覆盖**（强制 `overflow:'truncate'`），设了无效。要限宽用 `nameTruncate.maxWidth`。
- `nameTruncate.placeholder` 在 6.1.0 是**死配置** —— 只出现在默认值和类型里，没有任何代码读它。
- `nameGap` 从**轴线**量起而非从标签外沿，且 `nameMoveOverlap` 默认开（`AxisBuilder.ts:522-525`），重叠时会把轴名再推远（`:973-979`），所以调 `nameGap` 有时「看起来没生效」。真正控制轴名与刻度标签留白的是 `nameTextStyle.textMargin`。

**8. tooltip —— 排版 / 边框 / 提亮是一个配置项；文字描边要少量代码**

```js
tooltip: {
  trigger: 'axis',
  padding: [6, 8],
  backgroundColor: 'rgba(20,20,20,.92)',
  borderColor: '#555', borderWidth: 1, borderRadius: 6,
  textStyle: { color: '#fff', fontSize: 12, lineHeight: 16 },
  className: 'mosaic-tooltip',                                  // 描边走外部 CSS
  extraCssText: '-webkit-text-stroke:.3px rgba(0,0,0,.6);'      // 或走这里
}
```

- **默认渲染成 DOM，不是 canvas**：`TooltipModel.ts:113` `renderMode: 'auto'` → `util/model.ts:1044-1051` `env.domSupported ? 'html' : 'richText'`。Electron 里有 `document`，走 html；`TooltipHTMLContent.ts:309,326` 是 `document.createElement('div')` 挂在容器下。**含义：能用 CSS，而且导出 PNG 时 tooltip 不在画布里**（对这个插件是好事）。
- 紧凑排版：`padding` 支持数组（默认 html 是 `10`），`textStyle.lineHeight` 不配时是 `'line-height:1'`。行块间距 `HTML_GAPS = [0,10,20,30]`（`tooltipMarkup.ts:103`）**不可配**，要压只能自己写 `formatter`。
- 默认内容格式对中文友好：name 是 `<span>`，**value 是 `float:right` 右浮动**（`tooltipMarkup.ts:437-463`），中英混排不会错位。有 `valueFormatter`（但设了 `formatter` 就被忽略）。
- ⚠️ **`textBorderColor` / `textBorderWidth` 在 tooltip 里完全不生效**（已复核：对 `src/component/tooltip/` 整目录 grep `textBorder` **零命中**）。html 模式的 `assembleFont`（`TooltipHTMLContent.ts:150-179`）只输出 `color` / `font` / `line-height` / `text-shadow` / `text-decoration` / `text-align`；richText 模式（`TooltipRichContent.ts:76-118`）也只设 `textShadow*`，从不设 zrender 描边需要的 `stroke`/`lineWidth`。**这正是「文档写着支持、实测到不了引擎那层」的同型陷阱。** 描边只能走 `extraCssText`（`TooltipHTMLContent.ts:419`，拼在最后能覆盖前面的声明）或 `className` + 插件 `styles.css`（后者更适合这个插件，能跟 Obsidian 主题变量联动）。原生近似替代是 `textStyle.textShadowColor` + `textShadowBlur`。
- ⚠️ `tooltip.borderColor` 在 `show()` 时会被 `nearPointColor` 二次写入覆盖（`TooltipHTMLContent.ts:418`）。**显式设了就一定生效**；不设时 `trigger:'item'` 的边框会跟着数据点颜色变（这是设计不是 bug）。
- ⚠️ name 和 value **默认字号字重不同**（`tooltipMarkup.ts:65-70`：name 12px/400，value 14px/**900**）。一旦显式设 `textStyle.fontWeight`，value 的加粗就没了。
- ⚠️ **安全**：字符串模板 formatter 的**变量值**会转义（`util/format.ts:145-148`），但**函数 formatter 的返回值完全不转义**，直通 `el.innerHTML`（`TooltipHTMLContent.ts:453`）。图表配置来自笔记正文时，这是注入点 —— `innerHTML` 不执行 `<script>`，但 `<img onerror=...>` 照样执行。

**9. 标记特定 x 值 —— 一个配置项 ×2**

```js
xAxis: {
  type: 'category',
  data: ['一月', '二月', { value: '三月', textStyle: { fontWeight: 'bold' } }, '四月']
},
series: [{
  type: 'bar',
  markArea: {
    label: { show: false },
    itemStyle: { color: 'rgba(255,200,0,.18)' },
    data: [[{ xAxis: '三月' }, { xAxis: '三月' }]]
  }
}]
```

- **轴标签单独加粗**：`AxisBuilder.ts:1386-1394` —— 类目 data 项可以带 `textStyle`，`itemLabelModel = new Model(rawCategoryItem.textStyle, labelModel, ...)` per-category 覆盖 axisLabel 样式。这是最短写法。
- 备选（x 轴类目由 dataset 自动推出、没有 `xAxis.data` 可写时）：`axisLabel.formatter` 可以是函数并拿到 index（`axisHelper.ts:197-211`），返回 `{b|三月}` + 声明 `axisLabel.rich: {b:{fontWeight:'bold'}}`。⚠️ **`rich` 必须显式声明**，`labelStyle.ts:501-519` 的 `getRichItemNames` 只扫 `option.rich` 的键、不解析 formatter 字符串；`rich` 为空时 zrender 走纯文本分支，`{b|三月}` 会原样显示出来。另外 `axisLabel.color` 也支持函数 `(rawValue, index) => color`（`AxisBuilder.ts:1446`），但 `fontWeight` 没有这个入口。
- **背景色带**：见上文 B。折线图上的竖线用 `markLine: { symbol:'none', data:[{ xAxis:'三月' }] }`。
- ⚠️ markArea 的 `z: 1` 在 axisPointer（`z: 50`）之下，悬停高亮会盖在色带上面。

**10. y 轴顶部留 8% 空白 + 刻度凑整 —— 凑整内置，留白一个配置项（但口径要小心）**

```js
yAxis: { boundaryGap: [0, '8%'] }
```

- **刻度凑整是内置默认**：`src/coord/axisNiceTicks.ts:90-97` —— 用户没设 `max` 时 `newIntervalExtent[1] = ceil(extent[1]/autoInterval)*autoInterval`，轴上限一定被抬到 interval 的整数倍。`splitNumber` 默认 5（`axisDefault.ts:186`）。
- **留白**：value 轴的 `boundaryGap` 默认 `[0, 0]`（`axisDefault.ts:172`），消费点在 `src/coord/scaleRawExtentInfo.ts:274-291`：

  ```ts
  const span = (dataMM[1] - dataMM[0]) || Math.abs(dataMM[0]);   // :276-278
  noZoomEffMM[1] = dataMM[1] + boundaryGap[1] * span;            // :290
  ```

  ⚠️ **span 是「数据极差」不是「最大值」，而且「min 归零」发生在 boundaryGap 之后**（`needIncludeZero` 的处理在 `scaleRawExtentInfo.ts:301-313`，晚于 `:274-291`）。举个会咬人的例子：数据 100~110，`boundaryGap: [0, '8%']` 只留 `10 × 0.08 = 0.8` 的空白，而轴因为默认包含 0 会画成 0~110.8 —— **视觉留白只有轴高的 0.7%**。只有数据从 0 附近起时，`'8%'` 才等于「轴高的 8%」。
  ⚠️ boundaryGap 在**凑整之前**生效，所以最终可见的留白会 ≥8%（被向上取整到刻度线）。
  ⚠️ **裸数字是比例不是像素**。`axisCommonTypes.ts:156` 的类型注释写着 "absolute pixel number (like 35)"，**这条注释与实现不符** —— `parseBoundaryGapOptionItem`（`:474-481`）走 `parsePercent(opt, 1)`，裸数字原样返回当比例用，写 `8` 等于 800%。**只写 `'8%'` 或 `0.08`。**（这又是一处「文档写的和引擎读的不是一回事」。）
- **`max` 传函数也支持**：`scaleRawExtentInfo.ts:263-269` `isFunction(modelMaxRaw) ? modelMaxRaw({min, max}) : modelMaxRaw`。**但这是个陷阱** —— `:271` `fixMM[1] = noZoomEffMM[1] != null`，一旦 max 被显式设定，`axisNiceTicks.ts:95` 的 `ceil` 分支就被跳过，**刻度凑整失效**；`src/scale/Interval.ts:282-288` 还会在顶端额外插一个等于精确 max 的刻度（标签形如 `108.16`）。「8% 留白」和「凑整」在 `max` 这条路上互斥，只有 `boundaryGap` 能两者兼得。
  同理，写了 `min` 或 `max`（含 `'dataMin'`/`'dataMax'`）时对应那端的 `boundaryGap` 直接不生效 —— `:282` / `:287` 的 `== null` 判断决定的。
- 需要完全接管刻度值时的逃生口：`axisLabel.customValues` / `axisTick.customValues`（`src/coord/axisTickLabelBuilder.ts:121,151`）。

**11. 主题跟随 —— 少量代码，且 v6 不必销毁重建**

这是 v6 相对 v5 最重要的变化。`chart.setTheme()` 在 v5.6.0 的发布类型里是 `private setTheme;`，在 v6.1.0 里是公开签名 `setTheme(theme: string | ThemeOption, opts?: SetThemeOpts): void`。

```js
// 初始化
echarts.registerTheme('obsidian', buildObsidianTheme(document.body));
const chart = echarts.init(container, 'obsidian', { renderer: 'canvas' });
chart.setOption(option);

// Obsidian 主题切换时 —— 就这两行，不 dispose、不 init
echarts.registerTheme('obsidian', buildObsidianTheme(document.body));
chart.setTheme('obsidian');
```

依据：`src/core/echarts.ts:827-874` → `_updateTheme(theme)` + `ecModel.setTheme(this._theme)`（`src/model/Global.ts:548-551` → `_resetOption('recreate')`）+ 完整 update。`recreate` 是从 `optionBackup.baseOption`（历次 setOption 累积的**原始**用户 option）重建，不是拿已混入旧主题的 option，所以旧主题颜色不残留。

成本排序：`setTheme` < `setOption(opt, {notMerge:true})`（丢弃 GlobalModel 重建，保留 zrender 实例和 canvas）< `dispose() + init()`。

**坑**：
- `setTheme` 要求 `this._model` 已存在（`:840-843`），**必须先 `setOption` 过一次**，否则静默 return。
- 传未注册的主题名会**静默失败但照样走完整重绘**（`:882` 的 `if (theme)` 不成立，`_theme` 不变，无警告）。
- theme 对象的轴配置是**按 scale 类型分组**：`categoryAxis` / `valueAxis` / `timeAxis` / `logAxis`，**不是** `xAxis` / `yAxis`（`src/theme/dark.ts:209-212`）。
- **theme 和 option 里的颜色不要同时写**：`src/model/Global.ts:1025` —— `name === 'color' && option.color` 直接 return，theme 的调色板被整个丢弃；`:1036` `merge(option[name], themeItem, false)` 第三参 false = 不覆盖已有值。**option 永远赢过 theme**。选一条路走。
- `darkMode: true` 的作用**比想象的小**：全栈唯一消费点是 `zrender/src/graphic/Path.ts:294`，只影响图元内部标签的自动文字色和描边。**不会**自动把坐标轴、图例、背景变暗。
- v6 内部有 design token 系统（`src/visual/tokens.ts`，`tokens.color` / `tokens.darkColor`），但**没有从 `src/export/api.ts` 公开导出**，不是可用的 theming hook。

**CSS 变量桥接：必须自己做，而且传错的后果比「不生效」更糟。**

ECharts 和 zrender 里 `getComputedStyle` 只有 4 处，全与颜色无关；`cssVar` / `var(--` / `currentColor` 零命中。zrender 的颜色解析（`zrender/src/tool/color.ts:162-279`）支持 148 个命名色 + `#rgb(a)` / `#rrggbb(aa)` / `rgb(a)()` / `hsl(a)()`，**没有 `var()`**。

传 `'var(--text-normal)'` 的实际路径：它有 `(` 且以 `)` 结尾，通过了函数形式检查，`fname = 'var'` 落到 `default: return;`（`color.ts:272-273`）→ 返回 `undefined`。然后原始字符串一路直通 `ctx.fillStyle`（`zrender/src/canvas/graphic.ts:454`，唯一检查是 `typeof v === 'string' && v !== 'none'`）。按 canvas 规范，无效颜色赋值被**静默忽略、保留旧值** —— 图元会画成**上一个图元的颜色**，且随绘制顺序漂移。更糟的是 `parse()` 返回 undefined 会污染下游：`src/util/states.ts:255,263` 的 `liftColor()` 让 hover 高亮失效，`color.ts:517` 的 `modifyHSL` 和 `:475` 的 `lerp` 会**抛 TypeError**。**生产构建下全程零警告。**

所以必须 `getComputedStyle(el).getPropertyValue('--text-normal').trim()` 桥接成十六进制或 `rgba()` 再喂进 theme —— 这跟现在 `chart-theme.ts` 在做的事是同一件，不是新增负担。

颜色回调只有两个字段支持：series 级 `itemStyle.color`（`src/visual/style.ts:91,118-126`，注意**写在 `data[i].itemStyle.color` 里的函数永远不会被调用**）和 `axisLabel.color`（`AxisBuilder.ts:1446`）。`textStyle.color` / `label.color` / 顶层调色板都不支持回调。

**12. PNG 导出 —— 一个配置项（官方 API）**

Obsidian / Electron 下推荐直接拿 canvas，不走 data URI：

```js
const canvas = chart.renderToCanvas({ pixelRatio: 2, backgroundColor: bg });
canvas.toBlob(blob => { /* vault.createBinary(...) */ }, 'image/png');
```

或者要 data URI：

```js
const url = chart.getDataURL({
  type: 'png',
  pixelRatio: 3,
  backgroundColor: getComputedStyle(document.body).getPropertyValue('--background-primary').trim(),
});
```

依据：`src/core/echarts.ts:969-1011`。canvas renderer 下走 `renderToCanvas(opts).toDataURL('image/png')`（`renderToCanvas` 本身是公开方法，`:923-938`）；`excludeComponents` 按 mainType 临时置 `view.group.ignore = true`、导出后还原（`:988-998, 1006-1008`），注意它**只作用于组件 view，排除不了 series**。

⚠️ **不要用 toolbox 的 `saveAsImage`**：`SaveAsImage.ts:50-74` 在非 IE 分支走的是「创建一个**未挂载到 DOM** 的 `<a download href="data:...">` + 合成 MouseEvent 点击」。Electron 的 `will-download` 拦截、CSP 对 `data:` 导航的限制、以及大图 data URI 的体积上限，任何一条都会让它静默失败。用 `renderToCanvas` + `toBlob` + vault API 更稳，顺带省掉整个 `ToolboxComponent` 的体积（`getDataURL` 是 `ECharts.prototype` 上的核心方法，不依赖 toolbox）。

⚠️ `chart.getConnectedDataURL()` **不传参数会直接抛 TypeError** —— `:1026` 是 `opts.type`，而该方法没有 `getDataURL` 那句 `opts = opts || {}`（对比 `:982`）。至少传 `{}`。

⚠️ `type: 'jpeg'` 时背景默认取 `option.backgroundColor`（`:935`），常见是 `transparent`，JPEG 会渲染成**纯黑底**。

- **背景默认透明**：`:935` `opts.backgroundColor || this._model.get('backgroundColor')`，option 没设时 zr 背景是 `'transparent'`，zrender 的 `Layer.clear()` 对 `'transparent'` 只做 `clearRect` 不填色。透明 PNG 贴到白底文档里深色文字会看不清 —— **导出时应显式传背景色**。
- **`pixelRatio` 要真高清必须 `> devicePixelRatio`**：`zrender/src/canvas/Painter.ts:1295` 有分支，`pixelRatio <= dpr` 走 `drawImage` 拼层（受限于已有 layer 分辨率），大于才重新 brush 整个 displayList。
- **tooltip 是 DOM，天然不进 PNG**（导出图不会带悬浮框残影）。
- ⚠️ SVG renderer 下 `getDataURL` 无视 `type` 参数直接返回 SVG data URL（`:1000-1004`）。用 canvas renderer 就没这个问题。
- ⚠️ **动画未停就导出会拍到中间帧**：`getSvgDataURL()` 会先 `stopAnimation`（`:960-963`），但 `renderToCanvas` 不会。默认 `animation: 'auto'` + `animationDuration: 1000`（`globalDefault.ts:107-108`）。要么设 `animation: false`，要么等 `chart.on('finished', ...)`（`:2317`）。

**13. 数值标签描边 —— 内置默认行为**

见上文 C。`label: { textBorderColor: '#fff', textBorderWidth: 2 }`，描边天然在文字背后。

**14. 负值数据标签的方向翻转 —— 一个配置项，自动按符号翻**

```js
series: [{ type: 'bar', label: { show: true, position: 'outside' } }]
```

`src/chart/bar/BarView.ts:1274-1281`：

```ts
function getLabelPositionForHorizontal(layout, coordSys): 'top' | 'bottom' {
    if (layout.height === 0) { ...按轴 inverse 决定... }
    return layout.height > 0 ? 'bottom' : 'top';
}
```

屏幕 y 向下增长，`src/layout/barGrid.ts:460-473` 使正值柱 `height < 0`、负值柱 `height > 0`，所以**负值得到 `'bottom'`**（柱子下方）。结果作为 `defaultOutsidePosition` 传给 `setLabelStyle`（`BarView.ts:1039`），在 `src/label/labelStyle.ts:358` 被消费：`labelPosition === 'outside' && (labelPosition = opt.defaultOutsidePosition || 'top')`。横向柱同理有 `getLabelPositionForVertical` 决定 left/right（`:1283-1290`）。

⚠️ **触发条件很窄，必须是字面量 `'outside'`**。`defaultOutsidePosition` 在全 src **只有 `labelStyle.ts:358` 这一处被消费**，条件是用户写的字符串恰好等于 `'outside'`。显式写 `'top'` 会原样透传给 zrender，**永不翻转**（负值时会贴到零基线上方跟坐标轴打架）。

⚠️ **`position` 不能是函数**。`labelStyle.ts:354` 用 `textStyleModel.getShallow('position')`，`src/model/Model.ts:120-134` 的 `getShallow` 只做原值返回 + 父模型回退，不检测也不调用函数；值直接进 `textConfig.position`，zrender 的 `calculateTextPosition` 只处理数组和字符串 switch，**函数会落到所有分支之外 → 标签跑到包围盒左上角，无任何报错**。

⚠️ bar 的 defaultOption 里根本没有 `label` 键（`BaseBarSeries.ts:200-221` / `BarSeries.ts:144-173`），默认 `position` 是 `'inside'`（`labelStyle.ts:355`），所以开箱即用的柱标签不会翻转，必须主动写 `position: 'outside'`。

逐条精确控制的逃生口：`data: [{ value: -5, label: { position: 'bottom' } }]` 可用（`BarView.ts:242` → `:1029` → `labelStyle.ts:308-321`，父模型链回退到 series 级）。但 `labelLayout` 回调里**拿不到数据值**（`LabelManager.ts:133-149` 的参数没有 value），且设 `x`/`y` 会把 `textConfig.position` 置空（`:366-367`）。

**15. 悬停时的列背景带 / 竖线 —— 竖线内置默认，背景带一个配置项**

```js
tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }   // 柱状图：整列背景带
tooltip: { trigger: 'axis' }                                     // 折线图：竖线（默认 type 就是 line）
```

- `trigger:'axis'` **自动启用 axisPointer**，不用单独写组件（`src/component/axisPointer/modelHelper.ts:146-161`）。
- **`shadow` 的宽度自动等于类目带宽**：`CartesianAxisPointer.ts:171-191` → `viewHelper.calcAxisPointerShadowBandWidth`（`:268-281`）→ `calcBandWidth(axis, {fromStat, min:1})`（`src/coord/axisBand.ts:82-147`），类目轴走 `out.w = pxSpan / len`，**= 轴像素长度 / 类目数，精确一格**；`calcAxisPointerShadowEnds`（`:286-301`）以命中点为中心 ±bandWidth/2 并 clamp 在轴范围内，首尾列不会溢出。
- `shadowStyle.color` 默认 `rgba(129,130,136,0.2)`（`AxisPointerModel.ts:110-112` + `tokens.ts:188`）；`line` 默认是 1px **虚线**（`:104-108`）。shadow 只认 `shadowStyle`，line 只认 `lineStyle`（`viewHelper.ts:57-70`）。
- ⚠️ axisPointer `z: 50`，**色带盖在柱子上面**。要放到柱子底下：`tooltip:{axisPointer:{type:'shadow', z:1}}`（`z` 在 tooltip→axisPointer 的透传白名单里，`modelHelper.ts:241-245`；白名单只有 `type/snap/lineStyle/shadowStyle/label/animation/animationDurationUpdate/animationEasingUpdate/z`，其余得写顶层 `option.axisPointer`）。
- ⚠️ tooltip 触发的 axisPointer **默认不显示轴上的值标签**（`modelHelper.ts:262-264` 强制 `label.show = false`），要那个小黑标签得显式打开。

**16. 双轴组合图 —— 一个配置项**

```js
xAxis: { type: 'category', data: [...] },
yAxis: [{}, {}],
series: [
  { type: 'bar',  yAxisIndex: 0, data: [...] },
  { type: 'line', yAxisIndex: 1, data: [...] }
]
```

- `yAxisIndex` 由通用的 `getReferringComponents` 解析（`cartesianAxisHelper.ts:129-154`），Grid 按 x/y 索引对生成笛卡尔系（`Grid.ts:441-443`）。
- **两轴刻度默认完全独立**：`Grid.ts:146-171` 逐轴 `scaleCalcNice`，没有 `__alignTo` 就互不干涉。
- `alignTicks`（v5.3+）让刻度线对齐：写在**被对齐的那一根**上，如 `yAxis: [{}, { alignTicks: true }]`。依据 `Grid.ts:739-761`（收集 + 指定基准）+ `:160-169`（`scaleCalcAlign`）。⚠️ 与 `interval` 互斥（`:740` 显式判 `get('interval') == null`），配了 `interval` 静默失效；两根都写行为绕（倒序遍历 + `pop()`），建议只写一根。默认 undefined（不对齐）。
- **绘制顺序**：bar `z: 2`（`BaseBarSeries.ts:200-202`）、line `z: 3`（`LineSeries.ts:160-161`），**折线默认在柱子上面，不会被盖住**。要反过来直接改 `series[].z`。

---

## 4. 硬约束核验

### 4.1 许可证

| 包 | 许可证 | 依据 |
| --- | --- | --- |
| `echarts` 6.1.0 | **Apache-2.0**（标准全文，无改动） | `package.json` license 字段；`LICENSE` 共 222 行，前 201 行是未改动的 Apache-2.0 标准文本 |
| `zrender` 6.1.0 | **BSD-3-Clause**（版权方是百度，不是 ASF） | `node_modules/zrender/package.json` + `zrender/LICENSE` |
| `tslib` 2.3.0 | **0BSD**（等同公有领域，无署名义务） | `node_modules/tslib/package.json` |
| 内嵌 d3 代码 | BSD-3-Clause（Copyright 2010-2016 Mike Bostock） | `LICENSE:202-222` 的 `Apache ECharts Subcomponents` 段 + `licenses/LICENSE-d3` |

**商业使用没有限制。** Apache-2.0 明确授予商业使用、修改、分发、专利实施权。三点值得单独说清：

**① `zrender` 不是 Apache-2.0。** 它是 BSD-3-Clause、版权方是百度，而且是强制运行时依赖、必然打进产物。BSD-3-Clause 额外要求：不得用贡献者的名字为衍生产品背书或宣传。

**② d3 的 BSD-3-Clause 对这个插件是生效的。** `LICENSE:202-222` 声明四个文件内嵌了 d3 代码：`treemapLayout.ts` / `layoutHelper.ts` / `forceHelper.ts` / **`src/util/number.ts`**。前三个按需引入根本不会打进来，但**`util/number.ts` 是核心工具模块，必然被引入** —— 不能因为「不用树图」就忽略这条署名义务。

**③ ⚠️ 实测发现的合规缺口：esbuild 会把 Apache 和 zrender 的版权声明全部删掉。**

这不是理论问题。ECharts 每个源文件的头注释用的是 `/*` 而不是 `/*!`，也不含 `@license` / `@preserve` —— esbuild 默认只保留后者。实测按需打包产物：

```
legal comment blocks: 1              ← 只有 tslib 的
mentions "Apache License":     false
mentions "Apache Software Foundation": false
```

加 `--legal-comments=inline` 也救不回来。结果是一个荒谬状态：**微软 tslib 的 0BSD 授权被完整保留，而 Apache ECharts 和 zrender 的版权声明一个字都不剩。**

修复很轻，两步：

1. 插件仓库根目录放一份 `NOTICE`（或在 `LICENSE` / README 加一节），写明三方版权：ASF（echarts，Apache-2.0）、百度（zrender，BSD-3-Clause）、Mike Bostock（d3 片段，BSD-3-Clause）。
2. 用 esbuild 的 `banner` 选项把这段声明注入 `main.js` 顶部。

**分发义务清单**（发到 Obsidian 社区市场 = 对外分发，全部触发；公司内部使用不构成分发，一条都不触发）：

- §4(a) 分发包里带 Apache-2.0 全文；
- §4(b) 修改过的文件要标注 —— 不改源码则不适用；
- §4(d) **NOTICE 传递** —— echarts 确实带 `NOTICE`（四行：`Apache ECharts / Copyright 2017-2026 The Apache Software Foundation / This product includes software developed at The Apache Software Foundation`），上游有就必须传递，这正是上面 ③ 要补的；
- §3 专利授权：永久、全球、免费；反制条款是「你起诉 ECharts 侵犯专利则授权终止」，对这个项目无实际风险。

**④ ⚠️ 商标会约束插件名字。** Apache-2.0 §6（`LICENSE:139-140`）明确不授予商标权。ASF 商标政策（`apache.org/foundation/marks/`）原文写着 *"not use ASF trademarks in any software product branding"` —— **插件名里不能出现 "ECharts"**（`ECharts for Obsidian`、`Obsidian ECharts Plugin` 这类都不行），也不能用作域名、不能用 Apache logo。

允许的是叙述性合理使用（nominative fair use）：README / 设置页写 "Powered by Apache ECharts"、"基于 Apache ECharts 构建"、性能对比、推荐语，全部合规。ASF 另有一条**偏好**（非强制）：首次或显著提及时用全称 "Apache ECharts"。

这个插件叫 Mosaic，本来就不受影响 —— 只要别在未来改名时踩进去。

### 4.2 体积（实测）

**这是整份报告最反直觉的一节：换 ECharts 会让打包产物变小，而且是大幅变小。**

实测环境：`npm i echarts@6.1.0`，`npx esbuild <entry> --bundle --minify --format=esm --target=es2017`，与项目 `esbuild.config.mjs` 的 target 一致。

| 方案 | 打包后（字节） | gzip（字节） |
| --- | --- | --- |
| **现状** `import * as Plots from "@ant-design/plots"` + `@antv/scale`（preact 别名） | **1,566,884** | **463,465** |
| 参照：`@antv/g2` 的 `Chart` 单独引 | 1,370,080 | 406,291 |
| ECharts 全量 `import * as echarts from 'echarts'` | 1,142,036 | 382,653 |
| **ECharts 目标集**：bar + line + Grid + Tooltip + Legend + MarkArea + MarkLine + Canvas | **579,599** | **196,720** |
| ECharts 下限：bar + line + GridSimple + Canvas | 492,290 | 168,155 |
| 参照：preact/compat 单独引 | 25,335 | 9,726 |

预构建产物（`node_modules/echarts/dist/`）：

| 文件 | 原始 | gzip |
| --- | --- | --- |
| `echarts.min.js`（all） | 1,121,883 | 368,217 |
| `echarts.common.min.js` | 715,020 | 239,827 |
| `echarts.simple.min.js` | 500,315 | 169,119 |

**结论**：`main.js` 当前 1,658,880 字节，其中约 1.57MB 是图表引擎（94%）。换成 ECharts 目标集后引擎部分降到 0.58MB，**净减约 987KB 原始 / 267KB gzip（-63% / -58%）**。连 ECharts **全量**引入都比现在的 G2 小 42 万字节。

三条能省体积的事实（都从 install 文件核实）：

1. `TooltipComponent` 内部已 `use(installAxisPointer)`（`src/component/tooltip/install.ts:20,27`），`GridComponent` 也是 —— 不用单独 import `AxisPointerComponent`。
2. `LegendComponent` = plain + scroll 两个都装（`src/component/legend/install.ts:24-25`）。不需要滚动图例就用 `LegendPlainComponent`。
3. `LabelLayout` 已由 `echarts/core` 默认注册（`src/export/core.ts:27-29`），别重复引。

⚠️ **tree-shaking 的前提**：`package.json` 的 `sideEffects` 是**白名单数组**而非 `false`，列表包含 `lib/chart/*.js` 和 `lib/component/*.js`，即老式的 `import 'echarts/lib/chart/bar'` 被标记为有副作用、**摇不掉**。而 `charts.js` / `components.js` / `core.js` / `renderers.js` / `features.js` 这几个 barrel 不在列表里，可以摇。`module: "index.js"` 指向 ESM（`main` 才是 UMD），打包器会走 ESM 分支。zrender 同样标注了 `sideEffects`。**必须用 `echarts/charts` + `echarts.use()`，不要用 `echarts/lib/chart/*`。**

⚠️ **不要图省事直接用 `echarts.common.min.js`**：按需构建（580KB）比 common 预设（715KB）还小 135KB，而 common 里塞了 toolbox、dataZoom、Pie、Scatter、SVG renderer 这些用不上的东西。simple 预设则缺 tooltip / legend / markLine / markArea，直接不可用。

一个独立复核（另一路调研用略有差异的 import 清单实测）得到 591,615 / 201,109，与我的 579,599 / 196,720 相差约 2%（差异来自是否显式再 import 一次 `LabelLayout`）。两组数字都指向同一结论。同一路复核还用 SSR 渲染验证了这套 import 清单**功能真的完整**（legend 文本、数据标签、双 y 轴 name、markLine label、markArea 填充、`getDataURL` 全部存在），不只是「打包不报错」。

### 4.3 ES2017

**零风险，发布产物比要求低得多。**

- `tsconfig.json:3` —— `"target": "ES3"`。
- 实测扫描 `node_modules/echarts/dist/echarts.esm.mjs`（未压缩，3.4MB）：
  - `?.` 可选链：**0**
  - `??` 空值合并：0（9 处命中全是注释里的 `??? TODO`）
  - 对象展开 `{...`：0（命中全在注释）
  - `async` / `await`：0
  - class 声明：**0**（`grep -cE '^\s*(export )?class '` = 0）
  - 顶层 `let` / `const`：**0**（全是 `var`）
  - 箭头函数：30 处，**全部在注释里**
  - BigInt / 私有字段 / 正则 lookbehind / `Object.fromEntries` / `flatMap` / `padStart` / `globalThis` / `matchAll`：全部 0
- zrender dist 同样 0 个 class、0 个顶层 let/const。
- 独立复核用 acorn 对 npm 包里**每一个** JS 文件按 ES5 / ES2017 两级解析：`echarts/lib` 591 个文件、`zrender/lib` 119 个文件、3 个 dist bundle，**ES5 解析失败 = 0**。`dist/echarts.esm.mjs` 里 `var` 出现 16,144 次，`let` 84 次 / `const` 68 次全在注释里。
- `package.json` **无 `engines` 字段**；README 里**没有浏览器支持范围声明** —— 查不到。ES3 target 实质意味着理论上能跑到 IE8 级别，Electron 完全无压力。

**发布的是 ES5 语法（ES3 target 编译）+ ESM 模块封装。** esbuild 不需要改写任何 echarts 代码，也就不存在「被静默改写后语义漂移」的风险 —— 这一条比现在的 G2 链路安全得多。

⚠️ **但风险方向是反的，`--target=es2017` 这个 flag 必须保留。** 实测三个 target 的产物：

| esbuild target | 字节数 | 输出中的 `??` | acorn ES2017 解析 |
| --- | --- | --- | --- |
| `es5` | 596,439 | 0 | OK |
| **`es2017`（项目现用）** | 591,615 | **0** | **OK** |
| `esnext` | 591,283 | **30** | **FAIL** |

`esnext` 产物在偏移 9714 处出现 `function U(t,e){return t??e}` —— 这是 **esbuild 自己的压缩器把 `a != null ? a : b` 改写成了 `a ?? b`**，源码里本来没有。项目 `esbuild.config.mjs:22` 已经是 `target: 'es2017'`，保持即可。es2017 产物里的 321 个箭头函数和 31 个模板字符串同样是 esbuild 压缩器的输出，属于 ES2015，在上限内，无语义差异。

### 4.4 canvas / PNG

- **canvas 是默认渲染器**。`echarts.init(dom, theme, { renderer: 'canvas' })` 是默认值；按需引入时显式 `use([CanvasRenderer])` 即可，SVG renderer 完全不进包。
- `getDataURL()` 是官方公开 API（`src/core/echarts.ts:969`），签名和坑见第 12 项。

### 4.5 主题切换

见第 11 项。**不必销毁重建** —— `chart.setTheme()` 在 v6 是公开 API，内部走 `_resetOption('recreate')`，保留 zrender 实例和 canvas。canvas 读不到 CSS 变量，`getComputedStyle` 桥接是必须的，且传 `var(--x)` 会静默出错（详见第 11 项的三个雷）。

### 4.6 CJK

**测量**：zrender 有两条路径。

- `measureWidth()`（`zrender/src/contain/text.ts:96-104`）用真 canvas `ctx.measureText(整串)` + LRU(500) 缓存 —— **对中文完全准确**。
- `measureCharWidth()`（`:81-93`）是估算：ASCII 用逐字符实测表，**任何 charCode > 127 一律返回 `measureText('国').width`**（`:42`）。

哪条用在哪：类目轴自动 interval 计算、`truncate` 的最终确认 —— 都走**准确**的 `measureWidth`；只有 `overflow: 'break'/'breakAll'` 的换行位置全程用估算。**对纯中文两者几乎等价**（CJK 全角等宽），会算错的是带音标的拉丁字母、希腊/西里尔、emoji 和部分半角化的 CJK 标点。源码 `:36-40` 自己留了 `FIXME Other languages? Consider proportional font?`。

**换行**：`isAlphabeticLetter`（`zrender/src/graphic/helper/parseText.ts:672-682`）的区间不包含 CJK（0x4E00+），所以每个汉字都是合法断点，**逐字换行**，这对中文是正确行为。但 CJK 标点（0x3000–0x303F）同样被当断点，**没有禁则处理**，一行可能以 `。` 开头。

**省略号**：默认 `'...'`（三个 ASCII 点，`parseText.ts:98`），中文排版建议显式改 `ellipsis: '…'`。截断算法 `truncateSingleLine`（`:126-170`）先真实测量、每轮实测校正，`maxIterations` 默认 2。⚠️ `:161` 用 `substr` 按 UTF-16 code unit 截，emoji 会被劈半（BMP 汉字不受影响）。

**类目轴标签自动隐藏**：默认 `axisLabel.interval: 'auto'`（`axisDefault.ts:166-168`），算法在 `axisTickLabelBuilder.ts:351-420` —— 最多采样 40 个标签，测量结果 ×1.3 留白（源码注释就写着 "Magic number"），双层缓存防止缩放时闪烁。**没有自动旋转**（`rotate` 默认 0，全仓没有基于碰撞算旋转角的逻辑），`axisLabel.hideOverlap` 默认关闭。默认 `axisLabel` 上没有 `width` / `overflow` / `ellipsis`，即 **v6 默认不截断轴标签**。

**v6 的大改进 —— `grid.outerBounds` 取代 `containLabel`**：`GridModel.ts:47-48` 把 `containLabel` 标了 `@deprecated`，默认 `outerBoundsMode: 'auto'` + `outerBoundsContain: 'all'` + `outerBoundsClampWidth/Height: '25%'`（`:128-141`）。实现在 `layOutGridByOuterBounds`（`Grid.ts:819-925`），逐个标签实测 rect 算溢出再收缩 gridRect。**含义：v6 默认就会自动收缩绘图区保证长中文标签和轴名不被裁掉**（最多收缩 25%）。v5 需要显式 `containLabel: true`。这是「开箱即用程度」的实质提升。

### 4.7 响应式

**完全手动。** 全量搜索 `ResizeObserver` / `addEventListener('resize'` / `onresize`：ECharts `src/` 唯一命中是 `src/core/echarts.ts:607` 的一行注释（`// In case some people write window.onresize = chart.resize`）+ 预绑 `this`；zrender `src/` 零命中。

```js
new ResizeObserver(() => container.offsetWidth > 0 && chart.resize()).observe(container);
```

- ⚠️ **`chart.resize()` 永远无参调用**。`zrender/src/canvas/Painter.ts:1229-1230` 会把显式传入的尺寸写进 `this._opts`，之后无参调用会一直返回那个粘住的值。
- 容器尺寸为 0 时**不报错**（`zrender/src/canvas/helper.ts:122-127` 末尾 `|| 0`），生产构建下连警告都没有（`src/core/echarts.ts:2946-2957` 是 `__DEV__` only）。恢复没问题，`Painter.resize` 会重新读 DOM 并全量重绘。Obsidian 里 `display:none` 的 tab 切回来必须手动 `resize()`。
- `echarts.init(dom)` 在 dom 上已有实例时**返回旧实例**而非新建（`:2938-2945`），同样只在 `__DEV__` 下 warn。配合 `getInstanceByDom()` / `dispose()` 做生命周期管理。

现有 `ChartFigure.tsx` 已经有一套处理「ResizeObserver 报 0×0」的 `lastWidth` 逻辑，这部分可以原样保留。

### 4.8 依赖

运行时依赖只有 `zrender@6.1.0` + `tslib@2.3.0`，**两个都是精确版本锁定**（无 `^` / `~`），无 `peerDependencies`。zrender 自身只依赖 `tslib`。`src/` 下 785 处 `from 'zrender/src/...'`，无任何其他第三方运行时导入。`npm i echarts@6` 实测只装 **5 个包，0 vulnerabilities**。

`tslib` 会被 esbuild 完整内联，已实测确认：产物中无任何 bare import、无 `from "tslib"` 语句，`"tslib"` 字符串只在末尾的 license banner 注释里出现一次。echarts 全库只用到一个 helper（163 处 `import { __extends } from "tslib"`，去重后仅此一种）。产物是真正的单文件。

### 4.9 维护活跃度 —— 这是整份调研唯一的黄灯

**表面数据是好的**：主库 67,078 star，最后 commit 2026-08-04（12 天前），非 archived；Apache 组织下 13 个相关 repo 全部活跃；有专门的 issue/PR 机器人和 ASF 治理流程；v6 引入了 design token 系统、`setTheme` 公开 API、`grid.outerBounds`、`chord` series、`matrix` / `thumbnail` 组件、axis breaks、`registerCustomSeries`，是实质性大版本而非维护性发版。

**往里看一层则不然。**

**发版节奏在拉长**（剔除 rc 后的 stable 间隔）：

| tag | 日期 | 距上一个 stable |
| --- | --- | --- |
| 6.1.0 | 2026-05-19 | 293 天 |
| 6.0.0 | 2025-07-30 | 214 天 |
| 5.6.0 | 2024-12-28 | 184 天 |
| 5.5.1 | 2024-06-27 | 130 天 |
| 5.5.0 | 2024-02-18 | 215 天 |

中位数 214 天（约 7 个月），且**最近一档 293 天是历史最长**。

**Commit 的成分比数量重要**：最近 30 天 7 个 commit，其中 **4 个是 dependabot 依赖升级**，3 个是同一位外部贡献者的修复及其合并 —— **核心维护者 30 天内没有产出任何功能或修复代码，只做了合并动作**。最近 90 天 19 个 commit 里 11 个是杂务。

**Issue 覆盖率低且巴士系数为 1**：open issues **1372**、open PRs **188**。抽最近创建的 10 个 issue：有人工维护者回复的只有 **3 个，且全部来自同一个人（plainheart）**；4 个零评论；2 个只有社区路人回复。维护者一旦回复很快（中位数约 4.8 小时），所以**问题不是响应慢，是响应覆盖率只有 30%**。最近 5 个 issue（07-24 至 08-14）零维护者回复，叠加 08-04 之后再无 commit，指向 8 月上旬起维护者活动明显停摆。

**对这个插件的实际风险评估**：需要的是「柱 / 折线 / 双轴组合 + 图例 + tooltip + 标注 + 标签」这套极其成熟稳定的功能面，都是十年前就定型、被几十万项目日夜验证的代码路径，撞到新 bug 的概率很低。风险可接受，**但不要指望提 issue 能得到及时修复** —— 需要有自行 patch 或绕开的心理准备。好在 Apache-2.0 允许 fork 和修改，且这个库不需要任何扩展包。

⚠️ 生态扩展是另一回事：除 `echarts-gl` 外，`ecomfe` 下的扩展包基本已停维护（详见 §1.2）。**但这个插件一个扩展都不需要。**

---

## 5. 迁移成本估算

### 5.1 现状盘点（实测）

| 文件 | 行数 | 与引擎耦合 |
| --- | --- | --- |
| `src/render/chart-tag-config.mjs` | 1,081 | 强耦合 |
| `src/render/chart-theme.ts` | 54 | 强耦合 |
| `src/render/components/Chart.tsx` | 88 | 强耦合（`import * as Plots`） |
| `src/render/components/ChartFigure.tsx` | 225 | 弱耦合（导出按钮、resize、主题事件） |
| `src/render/render-chart.tsx` | 103 | 不受影响（只调 `buildChartFrom*` + `withTheme`） |
| `src/parse/chart-tag.mjs` + `chart-block.mjs` | 352 | 不受影响 |
| `src/entry/chart-*.tsx` | 277 | 不受影响 |

强耦合合计约 **1,223 行**，比预估的 1,100 行多出 `Chart.tsx` 的 88 行。

### 5.2 可以直接删掉的（库内置了）

对照 `chart-tag-config.mjs` 的实际结构：

| 现有代码 | 行号区间 | 换成什么 |
| --- | --- | --- |
| `legendBar` 自定义 symbol 注册 + `LEGEND_BAR_SYMBOL` | 60–89 | `legend.data[i].icon: 'path://...'`，0 行 |
| `LABEL_TRANSFORM`（标签避让 transform 链） | 110–136 | `labelLayout: { moveOverlap:'shiftY', hideOverlap:true }` |
| `isNegative` / `LABEL_OUTSIDE` / `LABEL_CENTER` | 137–163 | `label.position:'outside'`（自动按符号翻，`BarView.ts:1274`） |
| `Y_HEADROOM` / `headroomMax` / `yScale` / `domainTicks` | 307–350 | `yAxis.boundaryGap:[0,'8%']` + 内置 nice ticks |
| `@antv/scale` 的 `wilkinsonExtended` 依赖 | — | 整个依赖可移除 |
| `highlightAxisX` / `highlightMarks` / `HIGHLIGHT_Z_INDEX` | 374–433 | `xAxis.data[i].textStyle` + `series.markArea` |
| `HOVER_BAND_STATE` / `HOVER_BAND_INTERACTION` / `hoverBandStyle` / `applyHoverBandStyle` | 170–174, 225–231, 511–548 | `tooltip.axisPointer: { type:'shadow' }` |
| `CROSSHAIR_INTERACTION` / `crosshairStyle` / `applyCrosshairStyle` | 241–254, 572–593 | `tooltip.axisPointer: { type:'line' }` |
| `LABEL_HALO_WIDTH` / `labelTextStyle` / `applyLabelStyle` | 443–443, 468–510 | `label.textBorderColor/Width`（内置 strokeFirst） |
| `chart-theme.ts` 的 `withGridStroke` 逐 child 打补丁 | 30–42 | theme 对象里一处 `valueAxis.splitLine` |

粗估 **可删约 350–420 行**。

### 5.3 保留不动的

`CHART_COLORS` / `HEX_COLOR` / `LABELS_OFF` / `CHART_TYPES` / `CHART_NUMBER_FORMAT` / `formatChartNumber` / `CURRENCY_PREFIXES` / `unitText` / `valueFormatterFor` / `splitList` / `parseGranularityOptions` / `labelsEnabled` / `labelFor` / `colorsFor` / `toLong` / `buildFootnote` / `buildWarning` —— 这些是**数据与格式化层**，与引擎无关，约 250 行原样保留。

### 5.4 要重写的

- `buildChartFromRows`（704–973，约 270 行）：从「G2 spec」改成「ECharts option」。结构会更扁 —— G2 的 `children` / `encode` / `scale` / `transform` 分层换成 ECharts 的 `xAxis` / `yAxis` / `series` 平铺。工作量最大的一块，但是纯翻译，逻辑不变。
- `buildChartFromTag` / `buildChartFromInline`（974–1081）：签名和返回结构不变，只换内部调用。
- `chart-theme.ts`：**从「五个 apply\* 函数分别遍历 config 打补丁」收敛成「一个函数返回 theme 对象」**。这是净减法 —— 现在需要 apply\* 是因为 G2 spec 没有统一的主题入口，ECharts 有。
- `Chart.tsx`（88 行）：从 React 组件包装改成命令式 `echarts.init` / `setOption` / `dispose`，配合 `useRef` + `useEffect`。ECharts 没有官方 React 封装（`echarts-for-react` 是社区包），但这个插件用的是 preact/compat，手写 30 行 hook 比引第三方包更稳。
- `ChartFigure.tsx`：导出按钮从 `plotRef.current?.downloadImage?.()` 改成 `chart.getDataURL()` + 自建下载链接；主题事件从「重建整棵 React 子树」改成 `chart.setTheme()`；ResizeObserver 逻辑原样保留。约改动 30 行。

### 5.5 要新增的

- **CSS 变量 → theme 对象的桥接函数**（约 25 行）。现在的 `labelTextStyle(dark)` / `hoverBandStyle(dark)` 等五个函数做的就是这件事，合并成一个 `buildObsidianTheme(el)` 反而更短。
- `echarts.use([...])` 的按需注册清单（约 6 行）。
- 若要「堆叠柱薄段精确隐藏」，需要一个 `labelLayout` 回调（约 3 行）。

### 5.6 净估算

| 项 | 变化 |
| --- | --- |
| 删除 | −350 ~ −420 行 |
| 重写（等量替换） | ~400 行（`buildChartFromRows` + `Chart.tsx` + `chart-theme.ts`） |
| 新增 | +35 行 |
| **净** | **约 −320 ~ −390 行** |

**测试**（实测行数比预估的 1,835 多）：

| 测试文件 | 行数 | 受影响程度 |
| --- | --- | --- |
| `tests/chart-tag-config.test.mjs` | 1,981 | 主要战场 |
| `tests/chart-tag.test.mjs` | 544 | 解析层，不受影响 |
| `tests/chart-block.test.mjs` | 54 | 不受影响 |

`chart-tag-config.test.mjs` 里共 335 处断言，其中约 **81 处**直接断言 G2 spec 的形状（`config.children[...]`、`axis` / `scale` / `encode` / `transform` / `labelTransform` / `shapeField` / `yField` 这些键），需要改写断言目标；其余断言的是数据变换和格式化（`toLong` / `formatChartNumber` / `valueFormatterFor` / 粒度解析 / 警告文案），**不受影响**。

即受影响的断言约占 24%，而非最初估的 40%–60%。这块仍是迁移里最琐碎的成本，但比预期轻。

**解析层、入口层、区块组件（约 3,700 行）确实完全不受影响** —— 已核实 `render-chart.tsx` 只依赖 `buildChartFromTag` / `buildChartFromInline` / `parseGranularityOptions` / `withTheme` 四个导出，签名不变即可。

---

## 6. 三个最大优势 / 三个最大短板

### 优势

1. **体积反向优化，幅度极大。** 这是唯一一个「换库还变小」的选项 —— 实测引擎部分 1.57MB → 0.58MB（gzip 463KB → 197KB）。对一个「打包产物已 1.6MB」的社区插件，这一条本身就足以支撑决策。

2. **第 2、13、14、15 项这些「最花工时」的效果全是内置。** 标签「先错开后隐藏」是一个配置项且源码顺序确凿；标签描边天然在文字背后（`strokeFirst: true` 是默认）；负值标签自动翻向；悬停列背景带宽度自动等于类目带宽。这四项在现有代码里合计占了 `LABEL_TRANSFORM` + `LABEL_OUTSIDE` + `applyLabelStyle` + `hoverBandStyle` 四大块。

3. **v6 的三个新东西正好命中这个场景**：`chart.setTheme()`（主题切换不必销毁重建，v5 还是 private）、`grid.outerBounds` 默认开启（长中文标签自动收缩绘图区，v5 要手动 `containLabel`）、ES3 编译目标（ES2017 约束零风险）。加上依赖树只有 3 个包、Apache-2.0 + BSD-3 无商业限制。

### 短板

1. **CSS 变量传错会静默出错，而且后果很脏。** `'var(--text-normal)'` 会绕过所有校验直通 `ctx.fillStyle`，图元画成上一个图元的颜色并随绘制顺序漂移；同时 `parse()` 返回 undefined 会让 hover 高亮失效，甚至在 `modifyHSL` / `lerp` 里抛 TypeError。**生产构建下全程零警告。** 这需要在桥接层加一道自己的格式校验 —— 库不会帮你。

2. **文档和类型会骗人，语义还常常「差一点」，每一项都得自己核实。** 这轮撞到的类型层骗局有四处：tooltip 的 `textBorderColor/Width` 类型上有、源码里零命中；`moveOverlap` 的 `'shuffleX'/'shuffleY'` 类型上有、实现里没有；legend 的 per-item `formatter` 类型上有、读的是全局；`boundaryGap` 的类型注释写着「absolute pixel number」、实现却当比例用（写 `8` = 800%）。语义「差一点」的有三处：`boundaryGap` 的百分比基准是数据极差而非最大值、且与 `max` 二选一；`hideOverlap` 判的是「标签互相压到」而非「标签比色块高」；`markArea` 只在 bar series 上自动对齐整格。另外图例色块↔文字 5px 是硬编码字面量，只能靠负 padding 绕。**这正是这个项目吃过的那类亏的同型 —— 换库不能免疫，只能靠「关键结论必看源码」的纪律。**

3. **维护活跃度是黄灯。** 1372 open issues、188 open PRs、最近 10 个 issue 的维护者响应覆盖率只有 30% 且全部来自同一个人（巴士系数 1）、stable 发版间隔从 130 天拉长到 293 天、最近 30 天 7 个 commit 里 4 个是 dependabot、08-04 后无 commit。需要的功能面足够成熟，撞新 bug 概率低，但**提 issue 不要指望得到及时修复**，要有自行 patch 或绕开的准备。

（另有一条不算短板但必须动手的事：esbuild 会把 Apache 和 zrender 的版权声明全部删掉而只保留 tslib 的，需要补 `NOTICE` + esbuild `banner`。详见 §4.1。）

---

## 7. 不确定的地方

以下几点**没有实测验证**，报告里的判断只到源码阅读为止：

1. **没有实际跑起来一个图表。** 全部结论来自源码阅读 + 打包实测，没有在浏览器/Electron 里渲染验证过任何一个配置。特别是 `moveOverlap` + `hideOverlap` 同时生效的**视觉效果**（顺序在源码里确凿，但错开的幅度是否足够、`shiftLayoutOnXY` 的 squeeze 兜底在密集柱状图上表现如何），必须实测。

2. **markArea 在「grid 里一个 bar series 都没有」的纯折线图上的实际渲染结果没有验证。** 只确认了 `getMarkerPosition` 全仓仅 `BaseBarSeries` 实现、代码路径会退回 `dataToPoint`。零宽度是推论，未实测。绕法（`[{xAxis: idx-0.5},{xAxis: idx+0.5}]` 在 ordinal 轴上是否被接受）也未验证。

3. **`chart.setTheme()` 引入于哪个具体版本查不到。** 本地是 depth=1 浅克隆，无 git history。只能确认 v5.6.0 的发布类型里是 `private setTheme`、v6.1.0 是公开签名。如果项目要装 6.0.x，需要另行确认该版本是否已公开。

4. **`setTheme` 在带 `timeline` / `media` 的复杂 option 上的可靠性存疑。** `src/model/OptionManager.ts:164-166` 源码注释自己写着 `baseOption` "its reliability is under suspicion"。这个插件目前不用这两个特性，但如果将来用了要重新验证。

5. **测试改动比例（约 24%）是用 grep 数关键字估的**，没有逐条核对每个断言是否真的必须改。实际改起来可能更多（有些断言表面看是数据层、实际耦合了 spec 形状）。

6. **CJK 估算表对「半角化 CJK 标点」的具体误差幅度没有量化。** 只确认了 `measureCharWidth` 对 charCode > 127 一律返回 `国` 的宽度，没有实测中文标点在常见字体下的实际宽度差。

7. **`echarts-gl` 之外的扩展包与 v6 的兼容性没有实测**，只依据 `peerDependencies` 声明和 GitHub issue 标题判断。这个插件不需要扩展，所以未深入。

8. **ECharts 在大数据量下的性能没有评估。** `progressiveThreshold: 3000` / `animationThreshold: 2000` 这些默认值读到了，但这个插件的典型数据量（几十到几百行）远低于阈值，未展开。

9. **图例第 5 项存在过两轮相左的结论，我按源码判定了一次但没有实测。** 一轮说「同一 legend 内柱=方块、折线=12×4 横杠做不到，只能拆两个 legend」，另一轮说「用 `path://` + `symbolKeepAspect` 可以」。我在 `util/symbol.ts:358-364` → `util/graphic.ts:240-264` 的 `centerGraphic` 里代入数值算过（12×4 的 bbox 进 12×12 的框 → 12×4 居中），判定后者成立、前者只考虑了内置符号。**但这是纸面推演，没有真正渲染验证过。**

10. **`package.json` 无 `engines` 字段、README 无浏览器支持范围声明** —— 官方从未正式声明过支持哪些运行环境，只能从 ES3 编译目标反推。

11. **1372 个 open issue 的年龄分布 / stale 比例查不到**，需要全量分页拉取才能算，成本不划算。§4.9 的「响应覆盖率 30%」是最近 10 个 issue 的抽样，不是全量统计。

12. **`getDataURL` 在 Electron 里对大图 data URI 的体积上限没有实测。** 只判断了 toolbox `saveAsImage` 的 `<a download href="data:...">` 路径在 Electron 下有多个失败可能，推荐改走 `renderToCanvas` + `toBlob`，但没有验证 data URI 在什么尺寸下开始出问题。
