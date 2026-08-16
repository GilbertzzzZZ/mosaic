# 图表引擎选型调研：AG Charts

- 调研日期：2026-08-16
- 被调研版本：AG Charts **14.1.0**（发布于 2026-08-05）
- 证据来源优先级：**已发布 npm 产物（tarball）> 仓库源码 > 官方文档 > 博客**

> **关于证据路径的说明**：调研期间 `git clone` 前两次在中途被 git 自身清理（`fetch-pack: invalid index-pack output`，网络不稳），第三次成功。因此**主要结论用已发布的 npm tarball 作为证据源**——这比仓库源码更硬，仓库 `latest` 分支上是 `14.1.0-beta.20260809`，而 tarball 是用户真正会装到的 `14.1.0` 正式版。仓库最终可用后，所有 `REPO` 路径引用均已复核。
>
> 下文路径简写：
> - `TAR` = `本机 npm tarball 解包目录`
> - `TYPES` = `TAR/ag-charts-types/dist/types/src`（107 个 `.d.ts`，完整公开 API 类型定义，带 JSDoc）
> - `COMM` = `TAR/ag-charts-community/dist/package/main.esm.mjs`（Community 完整实现，未压缩，2.4 MB，可读）
> - `ENT` = `TAR/ag-charts-enterprise/dist/package/main.esm.mjs`
>
> 少量在仓库被删除前已读到的文件，用 `REPO` 前缀标注（`REPO` = `本机 ag-charts 仓库 checkout`，commit `2001e0c`）。

---

## 一句话结论

**AG Charts Community（MIT）能以「几乎全是配置项」的方式覆盖这个插件目前做的 16 件事里的 14 件，体积比现有 `@ant-design/plots` 还小 16%，零第三方依赖，并且内置了一套 CSS 变量自动跟随机制——这恰好是 Obsidian 主题跟随最难的那一环；代价是它只有 8 种基础图形，柱/折线/饼之外的一切（雷达、热力图、桑基、地图、仪表盘、树图）以及动画、悬停高亮全部是 Enterprise（$499/开发者），而网络图、流程图、思维导图、甘特图、词云它整个产品线都做不了。**

---

## ⚠️ 前置判断：核心能力是否大量落在 Enterprise？

**对这个插件的场景：基本否（16 项里只有 1 项落在 Enterprise）。但对「一家覆盖全」的诉求：是。**

分三句话说清楚：

1. **这个插件当前用到的能力，16 项里 15 项在 Community。** 双轴组合图、crossLines 色带、标签防碰撞引擎、PNG 导出、CSS 变量主题跟随——全部 MIT。
2. **唯一落在 Enterprise 的是第 15 项「悬停时的列背景带 / 竖线」。** `crosshair` 和 `bandHighlight` 两个模块都标了 `enterprise: true`（`packages/ag-charts-community/src/chart/factory/expectedModules.ts:475-488`）。Community 下这一项要自己实现。
3. **「图形类型覆盖广度」这条诉求，Community 基本不成立。** Community 只有 8 种 series：`bar / line / area / scatter / bubble / pie / donut / histogram`。**其余 27 种 series 全部 `enterprise: true`**，且 `animation`（动画）、`zoom`、`navigator`、`annotations`、`contextMenu` 等 14 个插件模块也是 Enterprise。

因此：**如果选型目标是「换一个引擎把柱/折线/饼这套做得更好」，AG Charts Community 成立且优秀；如果目标是「一家覆盖所有图形类型」，AG Charts 不成立**——既因为 Enterprise 收费，也因为它整个产品线就没有网络图/流程图/思维导图/甘特图/词云。

---

## 许可证详查

### Community：标准 MIT，无附加限制

`ag-charts-community` 的 `package.json` `license` 字段为 `MIT`，包内 `LICENSE.txt` 是**未经修改的标准 MIT 全文**：

> The MIT License
> Copyright (c) 2015-2026 AG GRID LTD
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software … to deal in the Software **without restriction**, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies …

— 出处：`TAR/ag-charts-community/LICENSE.txt` 第 1–20 行

**无任何附加条款**：没有署名要求（MIT 标准的保留版权声明除外）、没有非商业限制、没有水印、没有「开源项目才免费」这类条件。仓库顶层 `REPO/LICENSE.txt` 亦明示：

> This project is made up of many packages. There are two license types: MIT and Commercial.
> The following packages are MIT licensed: `ag-charts-community`, `ag-charts-angular` …

MIT 包（npm `license` 字段实测）：`ag-charts-community`、`ag-charts-core`、`ag-charts-types`、`ag-charts-locale`、`ag-charts-react`、`ag-charts-angular`、`ag-charts-vue3`、`ag-charts-vue`。
Commercial 包：`ag-charts-enterprise`、`ag-charts-server-side`、`ag-studio`。

官方对 Community 的表述（https://www.ag-grid.com/charts/javascript/community-vs-enterprise/ ）：

> **AG Charts Community**: **Free for everyone, including production use - no licence required.**

**结论：用于公司内部文档、闭源商用、开源插件分发，Community 全部无条件允许。**

### Enterprise：$499/开发者，且不能随开源插件分发

**定价**（出处 https://www.ag-grid.com/license-pricing/ ）：

公开定价页只列出「Single Application」一档；**完整价目表需在结账配置器（https://www.ag-grid.com/ecommerce/ ）里才能看到**：

| 产品 | Single Application（每开发者） | Multiple Applications（每开发者） | **Deployment 加购**（每个生产部署） |
|---|---|---|---|
| **AG Charts Enterprise** | **$499** | $1,499 | **$750** |
| AG Grid Enterprise | $999 | $1,499 | $750 |
| Enterprise Bundle | $1,498 | $2,998 | $1,500 |

授权性质（https://www.ag-grid.com/charts/javascript/community-vs-enterprise/ ）：

> Licences for AG Charts Enterprise are available on a **per-developer, per-deployment basis**. Licences are **perpetual** and come with 1 year of support and updates.

配置器内三种授权的定义（逐字）：

> **Single Application Development License** — Licenses **one** application, developed for **internal use** … Single Application Development Licenses are bound to an application name and **can't be reused on other applications**. For customer-facing applications you will also need a Deployment License add-on.
> **Multiple Application Development License** — Licenses **unlimited** number of applications, developed for internal use …
> **Deployment License Add-on** — Allows licensed developers to **sub-licence** AG Grid and / or AG Charts for **one application on one production environment** in perpetuity … **Only production environments require licensing. All other environments (eg development, test, pre-production) do not require a license.**

**⚠️ 注意：AG Charts 没有独立 EULA。** `https://www.ag-charts.com/eula/AG-Charts-Enterprise-License-Latest.html` 与 `https://www.ag-grid.com/eula/AG-Charts-Enterprise-License-Latest.html` 均 404；AG Charts 定价页上的 "EULA" 链接实际指向 `https://www.ag-grid.com/eula/AG-Grid-Enterprise-License-Latest.html`。**两个产品共用同一份协议**（当前 v39），而该协议全文**从未出现 "AG Charts" 字样**——它是框架协议，具体 "Software" 由 Quote 定义。

**「开发者」如何计数**——EULA 3.5 条（出处：`TAR/ag-charts-enterprise/LICENSE.html`，v39 条款，随包分发）：

> each developer developing with or **modifying JavaScript code as part of the creation or Modification of an Application's user interface**, which user interface creation or Modification uses the Software, shall constitute a separate Licensee Developer. For example, if the Licensee has five developers working with JavaScript code with respect to the creation or Modification of the user interface of an Application and such creation or Modification uses the Software, **but only two developers are directly working with the Software, all five developers will be counted**

即：**按接触该 UI 的全部前端开发者计数，不是按实际用到 AG Charts 的人数计数。**

**能不能随开源插件分发？不能**——EULA 3.3 条：

> Use of the Software Materials pursuant to the Licence, shall include the right to install, load, launch, access, run, execute, operate and archive the Software Materials … for the Licensee's and its Affiliates **internal business purposes** and, save where otherwise provided in these Terms, **must not be licensed to any third party including as part of an Application**.

要分发给第三方，需另购 **Deployment Licence Add-On**（EULA 定义）：

> **Deployment Licence Add-On** means a licence of the Software granted to the Licensee **in addition to** either the Single Application Developer Licence and/or Multiple Applications Developer Licence, **which permits the Licensee to sub-licence the Software** in accordance with these Terms

**Deployment Licence Add-On 静态定价页完全不提**（当前版与归档版全文均无 "deployment" 字样），$750 / $1,500 的价格只能在结账配置器里实测得到，**随时可能变**。

**开源/非商业豁免：不存在。** 全文检索 EULA，`open source` 只出现在 "Restrictive Open Source Software" 的定义里（那是限制**他们**引入 copyleft 依赖的条款，与用户资质无关），没有任何面向开源项目或非商业用途的免费条款。定价页也无任何开源豁免说明。

**没有 license key 会发生什么——水印 + 控制台报错，功能不禁用。** 这是源码级证据（`REPO/packages/ag-charts-enterprise/src/license/licenseManager.ts`）：

```ts
// 第 182-187 行
public isDisplayWatermark(): boolean {
    return (
        this.isForceWatermark() ||
        (!this.isLocalhost() && !this.isE2ETest() && !this.isWebsiteUrl() && !missingOrEmpty(this.watermarkMessage))
    );
}
```

`watermarkMessage` 的四种取值（同文件第 427/450/469/489 行）：`'Invalid License'`、`'Trial Period Expired'`、`'For Trial Use Only'`、`'License Expired'`。缺 key 时走 `outputMissingLicenseKey()`（第 453-470 行），控制台打印：

> `* All AG Charts Enterprise features are unlocked for trial.`
> `* If you want to hide the watermark please email info@ag-grid.com for a trial license key.`

水印注入实现见 `REPO/packages/ag-charts-enterprise/src/license/watermark.ts`（14 行，往 `canvas-overlay` 插一个 `.ag-watermark` 元素）。

**水印长什么样**（`REPO/packages/ag-charts-enterprise/src/license/watermark.css`）：右下角（`bottom:20px; right:25px`）一个 **170×40 px 的 AG Charts logo**（内联 base64 SVG，灰色 `#9b9b9b`）加一行 19px Impact 粗体文字，`opacity: 0.7`，`pointer-events: none`。**3 秒后淡出消失**（`animation: 1s ease-out 3s ag-watermark-fadeout`，终值 `opacity: 0`）。

即：不是永久贴在图上，但**每次渲染的头 3-4 秒用户都会看到**（官方文档说「a watermark for 5 seconds」，与 CSS 推算的 3s 延迟 + 1s 淡出略有出入，量级一致）。对一个笔记里可能有多张图的插件来说，这是不可接受的。

官方对无 key 行为的表述（https://www.ag-grid.com/charts/javascript/licensing/ ）：

> Without a valid licence key installed, your **console log will display a series of warnings** and the chart will show a **watermark for 5 seconds**.

**试用授权可以去掉水印，但不能用于生产**：

> It is free to try out AG Charts Enterprise and you do not need to contact us. All that we ask when trialling is that **you don't use AG Charts Enterprise in a project intended for production**.
> **30-Day Enterprise Bundle Trial** — … a free 30-day trial licence — **no restrictions, no watermarks**.

EULA 4.2(b)(i) 的试用期是 60 天（30 天试用 + 30 天洽谈期），4.2(a) 限定「solely for … **internal evaluation and review purposes** to determine whether to enter into a paid licence … and not for any other purpose」。

另外，官方也承认分发场景下 License Key 必然暴露：

> If you are distributing your product and including AG Charts Enterprise, we realise that your licence key will be visible to others. We appreciate that this is happening and just ask that you don't advertise it.

**关键含义**：`isLocalhost()` 会抑制水印——**本地开发看不到水印，用户装了插件才会看到**。这是开源插件绝对不能捆绑 Enterprise 的决定性理由。

**⚠️ 一条对「插件」形态特别不利的条款。** 结账页 "The Agreement important bits" 逐字：

> **You are not permitted to wrap our software in a custom UI component and make it available for development.**

EULA 3.7(b) 同向表述——获得 Deployable Licence 后仍不得：

> redistributed as part of any Application that can be described as a **development toolkit or library, an application builder, a website builder, a user interface designer, or any application that is intended for use by software, application, or website developers or designers**, or has a similar purpose or functionality (**as determined by the Licensor**)

**一个「让用户在 Markdown 里写配置来生成图表」的 Obsidian 插件，是否落入这条，条款把最终解释权留给了 AG Grid。** 这进一步坐实：**Enterprise 不是这个插件的可选项，无论是否付费。**

**公司内部文档算不算商业使用？** EULA 全文未使用 "commercial use" 这一措辞，它的划分维度是**内部使用 vs 对第三方再授权**：

- **可确定**：若确需 Enterprise，纯内部使用**不需要 Deployment 加购**——结账页原文：「**If the application you are building is for internal use only, you don't need a deployment license.** However, a deployment license is needed if you are building a customer-facing application…」
- **EULA 未回答（查不到）**：一个公司**仅仅"使用"由第三方开发者写的开源插件、自身不开发不分发**，算不算需要授权——EULA 只约束 Licensee，计费单位是 "Licensee Developers"（开发该 Application 的前端 JS 开发者），而这种情况下该公司零开发者。**要确定答案必须找 AG Grid 销售书面确认，本报告不做推测。**
- 被 EULA 明确点名有义务的是「**开发并分发含 `ag-charts-enterprise` 的 Application 的人**」——即插件作者本人。

---

## 1. 生态版图

GitHub 组织 `ag-grid` 下的产品仓库只有两个：**`ag-grid`**（数据表格）和 **`ag-charts`**（图表）。二者是**独立产品、独立版本号、独立定价**：AG Grid 当前 36.1.0，AG Charts 当前 14.1.0。唯一耦合点是 AG Grid 的 "Integrated Charts" 功能内嵌 AG Charts（`ag-grid-community` 依赖 `ag-charts-types`）。官方 `llms.txt` 列出的产品共三个：Data Grid、AG Charts、AG Studio（可视化配置工具）。

构建依赖链（出处 `REPO/AGENTS.md`）：
`ag-charts-core` → `ag-charts-types` → `ag-charts-locale` → `ag-charts-community` → `ag-charts-enterprise` → 框架封装

| 包名 | 干什么 | 层级 | 最近发版 | 是否必需 |
|---|---|---|---|---|
| `ag-charts-community` | 图表主体：8 种 series、坐标轴、图例、tooltip、标签排布、PNG 导出 | **MIT** | 14.1.0 / 2026-08-05 | **必需**（唯一要显式安装的） |
| `ag-charts-core` | 渲染层、场景图、几何/文本工具、模块注册表 | **MIT** | 14.1.0 / 2026-08-05 | 自动传递依赖 |
| `ag-charts-types` | 全部公开 API 类型定义（无运行时代码） | **MIT** | 14.1.0 / 2026-08-05 | 自动传递依赖 |
| `ag-charts-locale` | 31 种语言的 UI 文案（含 `zh-CN`/`zh-HK`/`zh-TW`） | **MIT** | 14.1.0 / 2026-08-05 | 自动传递依赖，按需 import |
| `ag-charts-enterprise` | 其余 26 种 series + 动画/缩放/导航条/标注/右键菜单等 | **Commercial** | 14.1.0 / 2026-08-05 | 否 |
| `ag-charts-server-side` | 服务端渲染（依赖 jsdom + skia-canvas） | **Commercial** | 14.1.0 / 2026-08-05 | 否 |
| `ag-charts-react` | React 封装 | MIT | 14.1.0 / 2026-08-05 | 否（本项目不需要） |
| `ag-charts-angular` | Angular 封装 | MIT | 14.1.0 / 2026-08-05 | 否 |
| `ag-charts-vue3` | Vue 3 封装 | MIT | 14.1.0 / 2026-08-05 | 否 |
| `ag-charts-vue` | Vue 2 封装 | MIT | **9.3.2 / 2024-07-16** | **已停止维护**（落后 5 个大版本） |
| `ag-charts-angular-legacy` | 旧版 Angular 封装 | MIT | **7.3.0 / 2023-04-20** | **已停止维护** |
| `ag-studio` | 图表可视化配置工具（独立应用） | Commercial | 2.1.1 / 2026-08-05 | 否 |

**装一个包能得到什么**：`npm i ag-charts-community` 拉入 4 个包（community + core + types + locale），**再无其他**。实测依赖树：

```
sizetest@1.0.0
└─┬ ag-charts-community@14.1.0
  ├─┬ ag-charts-core@14.1.0
  │ └── ag-charts-types@14.1.0 deduped
  ├── ag-charts-locale@14.1.0
  └── ag-charts-types@14.1.0
非 AG 包：[]
```

对照：`@ant-design/plots@2.6.8` 装进来 **93 个包**。

**要装几个包覆盖常见需求**：柱/折线/组合/饼/散点/直方图 → **1 个包**。其余任何图形类型 → 必须加 `ag-charts-enterprise`（付费）。

---

## 2. 图形类型覆盖

**层级判定用的是代码级证据**，不是官网文案：Community 包里内置一张模块清单 `ExpectedModules`，每个模块带 `enterprise?: boolean` 标记。

- 源码定义：`REPO/packages/ag-charts-community/src/chart/factory/expectedModules.ts` 第 5-11 行
  ```ts
  export interface ModulePlaceholder {
      type: `${ModuleType}` | ModuleType;
      name: string;
      moduleId: string;
      chartType?: ChartType;
      enterprise?: boolean;
      optionsKey?: string;
  }
  ```
- 已发布产物中同一张表：`COMM` 内 `ExpectedModules` 数组（约 33355 行起）。

模块共 6 类：`chart` / `axis` / `axis:plugin` / `series` / `series:plugin` / `plugin` / `preset`。**⚠️ 判定时必须把 `axis:plugin` 和 `series:plugin` 一起数进来**——`crosshair`、`bandHighlight`、`crossLines`、`errorBar` 都在这两类里，只看 `plugin` 会漏判（本次调研初稿就在这里出过错，见第 3 节第 15 项）。

### Community 全量（这就是免费能拿到的全部）

| 类别 | 名单 |
|---|---|
| **series（7 稳 + 1 存疑）** | `bar`（含 grouped/stacked/normalized/horizontal）、`line`、`area`、`scatter`、`bubble`、`pie`、`donut`，外加 `histogram`（⚠️ 代码说免费、文档说收费，勿依赖，见下） |
| **chart（2）** | `cartesian`、`polar` |
| **axis（6）** | `number`、`log`、`time`、`unit-time`、`category`、`grouped-category` |
| **axis:plugin（1）** | `crossLines`（仅 cartesian，静态参考线/色带） |
| **plugin（2）** | `legend`、`locale` |
| **preset（1）** | `sparkline` |

### Enterprise 全量（付费才有）

| 类别 | 名单 |
|---|---|
| **series（27）** | box-plot、candlestick、ohlc、cone-funnel、funnel、pyramid、heatmap、range-area、range-bar、waterfall、nightingale、radar-area、radar-line、radial-bar、radial-column、map-shape、map-line、map-marker、map-shape-background、map-line-background、linear-gauge、radial-gauge、sunburst、treemap、chord、sankey、organization |
| **chart（2）** | `standalone`、`topology` |
| **axis（5）** | `ordinal-time`、`angle-category`、`angle-number`、`radius-category`、`radius-number` |
| **axis:plugin（3）** | **`crosshair`**、**`bandHighlight`**、`polarCrossLines` |
| **series:plugin（1）** | `errorBar` |
| **plugin（14）** | **`animation`**、`annotations`、`chartToolbar`、`contextMenu`、`statusBar`、`dataSource`、`sync`、`ranges`、`zoom`、`flashOnUpdate`、`gradientLegend`、`navigator`、`scrollbar`、`selection` |
| **preset（2）** | `gauge-preset`、`price-volume` |

**其中 `animation` 落在 Enterprise 意味着：Community 版图表没有入场/更新动画。**

### 覆盖矩阵

| 图形类型 | 是否支持 | 在哪个包 | 层级 | 限制 |
|---|---|---|---|---|
| 柱/条（分组、堆叠、百分比堆叠、水平） | ✅ | community | **Community** | — |
| 折线 | ✅ | community | **Community** | — |
| 面积（含堆叠） | ✅ | community | **Community** | — |
| 散点 / 气泡 | ✅ | community | **Community** | — |
| 饼 / 环 | ✅ | community | **Community** | — |
| 直方图 | ✅ | community | **Community** | ⚠️ 见下方「文档与源码冲突」 |
| **组合图 / 双轴（柱+线，左右两轴）** | ✅ | community | **Community** | — |
| Sparkline（迷你图） | ✅ | community | **Community** | preset |
| 箱线图 box plot | ✅ | enterprise | Enterprise | — |
| 瀑布图 waterfall | ✅ | enterprise | Enterprise | — |
| 漏斗图 funnel / cone-funnel | ✅ | enterprise | Enterprise | — |
| 金字塔 pyramid | ✅ | enterprise | Enterprise | — |
| 热力图 heatmap | ✅ | enterprise | Enterprise | — |
| **日历热力图** | ✅ | enterprise | Enterprise | 无独立 series，用 `heatmap` 配出来 |
| 矩形树图 treemap | ✅ | enterprise | Enterprise | — |
| 旭日图 sunburst | ✅ | enterprise | Enterprise | — |
| 桑基图 sankey | ✅ | enterprise | Enterprise | — |
| 和弦图 chord | ✅ | enterprise | Enterprise | — |
| **组织架构图 organization** | ✅ | enterprise | Enterprise | 树形卡片 |
| 雷达 radar-line / radar-area | ✅ | enterprise | Enterprise | 需 polar 轴（也是 Enterprise） |
| 玫瑰图 nightingale | ✅ | enterprise | Enterprise | — |
| 径向柱 radial-bar / radial-column | ✅ | enterprise | Enterprise | — |
| 仪表盘 radial-gauge / linear-gauge | ✅ | enterprise | Enterprise | — |
| **子弹图 bullet** | ✅ | enterprise | Enterprise | 无独立 series，用 `linear-gauge` 配出来 |
| K 线 candlestick / OHLC | ✅ | enterprise | Enterprise | — |
| 区间图 range-area / range-bar | ✅ | enterprise | Enterprise | — |
| 金融图表预设 | ✅ | enterprise | Enterprise | — |
| 地图 map-shape / map-line / map-marker | ✅ | enterprise | Enterprise | **底图 GeoJSON 需自备，官方不提供数据包** |
| 误差棒 error bars | ✅ | enterprise | Enterprise | 附加于 bar/line/scatter |
| **透视表 / 交叉表** | ❌（AG Charts 不做） | `ag-grid-enterprise` | Enterprise | 属于表格产品 |
| **网络图 / 关系图 / 力导向图** | ❌ **做不到** | — | — | 整个产品线都没有 |
| **流程图 / diagram** | ❌ **做不到** | — | — | — |
| **思维导图** | ❌ **做不到** | — | — | — |
| **树图 / 树状图 dendrogram** | ❌ **做不到** | — | — | 层级数据只有 treemap/sunburst/organization |
| **甘特图** | ❌ **做不到** | — | — | AG 无自研，官网仅导流到第三方 Bryntum |
| **时间线 timeline** | ❌ **做不到** | — | — | 只有 time **轴**，没有 timeline 图 |
| **词云** | ❌ **做不到** | — | — | — |
| 平行坐标 / 弧形图 / 圆堆积 / Voronoi / 3D | ❌ **做不到** | — | — | 全库无 3D 渲染 |

> 判定依据：官方 sitemap 共 757 条 URL，用 `network|force|flow-?chart|mind|dendro|gantt|word-?cloud|timeline|parallel|arc-|circle-pack|voronoi|sonar|3d` 全量匹配，只命中 `gallery/calendar-heatmap/`、`gallery/simple-bullet/` 和金融标注 `annotations/parallel-channel/`（后者是金融图的「平行通道」标注工具，不是平行坐标图）。

### 这一家做不到、必须另找库的常见类型

**网络图/关系图、流程图、思维导图、树状图、甘特图、时间线、词云、透视表、平行坐标。**

### ⚠️ 文档与源码冲突：histogram

官网文档把 histogram 标为 Enterprise（https://www.ag-grid.com/charts/javascript/histogram-series/ ），**但源码和已发布产物都表明它是 Community**：

- `REPO/packages/ag-charts-community/src/chart/series/cartesian/histogramSeriesModule.ts` 第 72-77 行，`enterprise: true` 被**注释掉**了：
  ```ts
  export const HistogramSeriesModule: SeriesModuleDefinition<AgHistogramSeriesOptions> = {
      type: 'series',
      name: 'histogram',
      chartType: 'cartesian',
      // enterprise: true,
      version: VERSION,
  ```
- `REPO/packages/ag-charts-community/src/main.ts` 第 24 行导出 `HistogramSeriesModule`
- `REPO/packages/ag-charts-community/src/module-bundles/cartesian-series.ts` 第 14 行将其纳入 Community bundle
- 已发布 `COMM` 中该注释原样保留，可 grep 到 `name: "histogram"` 且无 `enterprise: true`

**但官方文档的 frontmatter 明写 `enterprise: true`**（`REPO/packages/ag-charts-website/src/content/docs/histogram-series/index.mdoc`，与 heatmap 等真 Enterprise 页面一致；对照 `line-series/index.mdoc` 则没有该字段）。

**这正是「上游文档写着一套、代码实际是另一套」的案例——只不过方向反了：文档说收费，代码说免费。** 运行时行为由模块清单决定，所以它现在确实能在 Community 里跑；但供应商意图是收费，**任何一个版本都可能把那行注释放开**。**结论：能用，但不要作为选型依据，也不要在产品里依赖它。**

---

## 3. 十六项对照

五档结论：**内置默认行为 / 一个配置项 / 少量代码(<10 行) / 要自己实现 / 做不到**

> **先说一个会影响多项的 v14 API 变更**：`axes` 不再是数组，改为**字典**（`Record<string, AgCartesianAxisOptions>`，默认 key 为 `x`/`y`），series 通过 `xKeyAxis` / `yKeyAxis` 字符串引用轴。旧版的 `axes[].keys` 已不存在。
> 证据：`TYPES/chart/cartesianOptions.d.ts:97,109`；`TYPES/series/cartesian/commonOptions.d.ts:4-17`；默认值实现 `COMM:43878-43879`（`this.xKeyAxis = "x"; this.yKeyAxis = "y";`）

| # | 事项 | 结论 | 配置路径 / 依据 | Enterprise？ |
|---|---|---|---|---|
| 1 | 折线粗细可配 | **一个配置项** | `series[].strokeWidth`。`TYPES/series/cartesian/commonOptions.d.ts:146-153`（`StrokeOptions`）；line 继承于 `TYPES/series/cartesian/lineOptions.d.ts:28` | 否 |
| 2 | **数据标签防碰撞：错开优先、隐藏兜底** | **一个配置项** | 见下方详述 | 否 |
| 3 | 组合图去掉与左轴重复的右轴 | **内置默认行为** | 新模型下**不声明第二根轴**即可，两个 series 共用默认 `y` 轴。若已声明要隐藏：无 `visible` 字段，需逐部件 `line/tick/label/gridLine/title.enabled:false`（AG 自己的 navigator 迷你图就这么干：`COMM:31684-31694`） | 否 |
| 4 | **堆叠柱数字在各自色块正中** | **一个配置项** | `series[].label.placement` 默认即 `'inside-center'`（`COMM:60435`）。**段太薄时**：`placement` 接受**有序回退数组**「依次尝试直到放得下」，如 `['inside-center','beside-after-center']`；另有 `minimumFontSize` 自动缩字号、`collision.alwaysShow:false` 兜底隐藏。`TYPES/series/cartesian/barOptions.d.ts:11-27` | 否 |
| 5 | 图例标记尺寸与形状 | **一个配置项** | 方块 12×12 → `legend.item.marker.{size:12, shape:'square'}`；间距 4px → `legend.item.marker.padding:4`；**折线系列 12 宽 4 高横杠 → `legend.item.line.{length:12, strokeWidth:4}`**（`showSeriesStroke` 默认已是 `true`，`COMM:56503`）。`TYPES/chart/legendOptions.d.ts:33-48,122`。任意宽高矩形可用 `AgMarkerShapeFn` 自绘（<10 行） | 否 |
| 6 | 图例位置顶部居中 | **一个配置项** | `legend.position: 'top'`（`'top'` 实现即居中）。枚举 12 值见 `TYPES/chart/legendOptions.d.ts:8`。**注意无 `legend.align` 字段** | 否 |
| 7 | 单位文字的放置位置 | **一个配置项** | 根级 `formatter` 一处覆盖轴标签+数据标签+tooltip：`formatter: { y: ({value}) => \`${value} 元\` }`。回调带 `source`（`'axis-label'`/`'series-label'`/`'tooltip'`…）可分位置区分。`TYPES/chart/chartOptions.d.ts:299-300`、`TYPES/chart/formatterOptions.d.ts:6-8,84-86`。另有轴标题 `axes.y.title.text`、逐处 `label.format`/`formatter` | 否 |
| 8 | **tooltip**：紧凑排版、文字提亮、描边、边框 | **一个配置项**（描边除外，见下方详述） | 紧凑 → `tooltip.mode:'compact'`（内置三模式 `'single'\|'shared'\|'compact'`）；文字/边框/背景 → `theme.params.{tooltipTextColor, tooltipSubtleTextColor, tooltipBorder, tooltipBackgroundColor, tooltipBorderRadius}`；完全自定义 → `series[].tooltip.renderer`（Community）。tooltip 是 **DOM 不是 canvas**，有 20 个稳定 class 名可直接写 CSS，**文字描边用 CSS `text-shadow` 即可** | 否 |
| 9 | **标记特定 x 值**：轴标签加粗 + 该列背景色带 | **一个配置项 + 少量代码** | 背景色带/竖线 → `axes.x.crossLines[]`，`type:'range'` 给 `[start,end]` 画色带、`type:'line'` 给单值画竖线，带 `fill/fillOpacity/stroke/strokeWidth/lineDash/label`（`TYPES/chart/crossLineOptions.d.ts` 全文）。轴标签加粗 → `axes.x.label.itemStyler` 逐标签回调返回 `fontWeight`（`TYPES/chart/axisOptions.d.ts:203`），约 3 行 | 否（`crossLines` 在 `cartesianAxisOptionsDefs`，Community） |
| 10 | y 轴顶部留 8% 空白 + 刻度凑整 | **凑整=内置默认行为；8% 留白=少量代码(<10 行)** | `axes.y.nice` **默认 `true`**（`COMM:23328`：`this.nice = options.nice ?? true`）。**无百分比留白配置项**——number 轴全部选项已逐一核对（`TYPES/chart/cartesianOptions.d.ts:269-273`），`headroom`/`domainPadding`/`expandDomain` 在 `TYPES/**` 零命中。做法：自己算 `dataMax` 后设 **`preferredMax = dataMax * 1.08`**（只抬高不裁数据，且 `nice` 仍生效继续向上取整；用 `max` 则会关掉该侧 nice，见 `COMM:43475`）。语义实现 `TAR/ag-charts-core/…` `normalisedExtentWithMetadata` | 否 |
| 11 | **主题跟随**：明暗切换重建、颜色走宿主 CSS 变量 | **内置默认行为** | **本次调研最大发现，见下方详述** | 否 |
| 12 | PNG 导出 | **一个配置项**（一次 API 调用） | `chartInstance.download(options?): Promise<void>` 与 `chartInstance.getImageDataURL(options?): Promise<string>`，支持 `image/png`/`image/jpeg`、`width`/`height`/`fileName`。`TYPES/chartBuilderOptions.d.ts:102-113,138-149`。在基础 `AgTypedChartInstance` 接口上 → Community | 否 |
| 13 | **数值标签描边**（文字光晕） | **做不到**（但有等效替代：一个配置项） | 标签样式类型 `AgChartLabelStyleOptions = Toggleable + TextOptions + LabelBoxOptions`（`TYPES/chart/labelOptions.d.ts:5`）。`TextOptions` 只有 `color`（`TYPES/series/cartesian/commonOptions.d.ts:190-193`）——**没有 text stroke**。底层 scene `Text` 节点其实实现了 `executeStroke()→ctx.strokeText()`（`COMM` 可见），但**未暴露为公开选项**。替代方案：`LabelBoxOptions` 提供 `fill`+`border`+`cornerRadius`+`padding`（`TYPES/series/cartesian/commonOptions.d.ts:157-164`），即给标签加半透明底色块，可读性目的等效且更现代 | 否 |
| 14 | 负值数据标签方向翻转 | **内置默认行为** | 自动。`COMM:59349` 判正负 → `COMM:59482` 结合轴 reverse 得朝向 → `COMM:46299` `barDirection = (isUpward ? 1 : -1) * (isVertical ? -1 : 1)` 翻转偏移。`start`/`end` 语义是**相对柱子自身几何**而非屏幕方向（`COMM:46237-46241`），负柱的 `outside-end` 自然渲染在下方，零配置 | 否 |
| 15 | 悬停时的列背景带 / 竖线 | **Enterprise 下：一个配置项；Community 下：要自己实现** | 列背景带 → `axes.x.bandHighlight`（`enabled/fill/fillOpacity/stroke/strokeWidth/lineDash`，`TYPES/chart/bandHighlightOptions.d.ts`）；竖线 → `axes.x.crosshair`（含 `snap` 吸附、`label`）。**两个模块都标了 `enterprise: true`**，见下方详述 | ⚠️ **是** |
| 16 | 双轴组合图 | **一个配置项** | `axes: {x, y, y2}` + `series[].yKeyAxis:'y2'`。涉及模块 `CartesianChartModule`/`NumberAxisModule`/`CategoryAxisModule`/`BarSeriesModule`/`LineSeriesModule`/`LegendModule` 在 manifest 中**全部无** `enterprise: true` | 否 |

**十六项汇总：内置默认行为 4 项、一个配置项 9 项、少量代码 2 项、做不到 1 项（第 13 项文字描边，有等效替代）。其中第 15 项需要 Enterprise，Community 下要自己实现。**

### 重点核实：第 15 项（悬停高亮）——Enterprise

**这一项是本次调研中被修正过的结论**，值得说明修正过程：`crosshair` 和 `bandHighlight` 的**选项类型定义**在 `ag-charts-types` 里（共享包），**选项 schema**（`cartesianAxisOptionsDefs`）也出现在 Community 产物中——只看这两处会误判为 Community。真正的判据是模块清单，而它们属于 `type: 'axis:plugin'` 这一类：

```ts
// packages/ag-charts-community/src/chart/factory/expectedModules.ts:461-488
{ type: 'axis:plugin', name: 'crossLines',      chartType: 'cartesian', moduleId: 'CrossLinesModule' },          // ← 无 enterprise，Community
{ type: 'axis:plugin', name: 'polarCrossLines', chartType: 'polar', optionsKey: 'crossLines',
  enterprise: true, moduleId: 'PolarCrossLinesModule' },
{ type: 'axis:plugin', name: 'crosshair',       chartType: 'cartesian', enterprise: true, moduleId: 'CrosshairModule' },
{ type: 'axis:plugin', name: 'bandHighlight',   chartType: 'cartesian', enterprise: true, moduleId: 'BandHighlightModule' },
```

实现文件也确实只在 Enterprise 包里：`packages/ag-charts-enterprise/src/features/band-highlight/bandHighlightModule.ts`（`enterprise: true`，且 `themeTemplate.enabled` 默认 `false`）、`packages/ag-charts-enterprise/src/features/crosshair/crosshairModule.ts:10`。

**官方文档同向确认**：ag-grid.com 的 AG Charts 功能对比表把 "Crosshairs & Band Highlight" 列在 Enterprise 侧，而 "Cross Lines" 列在 Community 侧。代码与文档在这一项上一致。

**注意区分**：第 9 项用的 `crossLines`（静态参考线/色带，标记固定的某个 x 值）是 **Community**；第 15 项要的是**跟随鼠标的动态高亮**，那是 Enterprise。这两件事在这个插件里是不同需求，不要混淆。

**Community 下的自实现路径**：监听 `chartInstance` 的 highlight 事件，动态改写 `axes.x.crossLines` 为当前悬停类别 —— 可行但要自己写状态管理与节流。另一个 Community 钩子是 `backgroundRegions`（`type: 'series-area:plugin'`，无 enterprise 标记），但它画的是静态区域，不响应悬停。

### 重点核实：第 2 项（标签防碰撞）

这是插件花工时最多的地方，AG Charts 有一个**专门的标签排布引擎**：`REPO/packages/ag-charts-core/src/utils/geometry/labelPlacement.ts`，**2294 行**，带空间索引（`SpatialIndex`）、障碍物索引、多候选位试位、旋转标签外接矩形计算。

公开 API 恰好就是「错开优先、隐藏兜底」的两段式（`TYPES/chart/collisionAvoidanceOptions.d.ts`）：

```ts
/** Configuration controlling how a label behaves when it cannot be placed clear of every obstacle. */
export interface AgChartLabelCollisionOptions {
    /** Collision threshold in pixels. A positive value triggers avoidance strategies when labels are
     *  further away, a negative value allows labels to overlap without triggering avoidance. */
    threshold?: PixelSize;
    /** Whether to keep a colliding label visible when a collision remains after every avoidance
     *  strategy has been applied. When `true` the label stays at the best available position;
     *  when `false` it is hidden instead. */
    alwaysShow?: boolean;
}
```

配合「有序候选位」：

- 通用 series：`label.placements` — `'inside'|'top'|'bottom'|'left'|'right'|'top-left'|'top-right'|'bottom-left'|'bottom-right'`
- 柱族：`label.placement` — 11 值，含 `beside-*` 系列专为「极薄堆叠段」设计，JSDoc 原文：
  > The `beside-*` values offset it perpendicular to the value axis, floating it to the side of the segment … **`beside-*` is useful for tiny stacked segments with no room to place a label along the value axis.**
- 柱族还可给 `orientation` 有序数组（`'horizontal'|'vertical'|'vertical-reversed'`），横放不下就自动转 90°

引擎行为（`labelPlacement.ts` 第 1481-1487 行 JSDoc）：

> Keep-series (never dropped) resolve first as fixed obstacles, then droppable series; within each group, **larger markers claim their placement first**. … External obstacles (e.g. bar rects, pie sectors) every label must avoid, in addition to markers and **already-placed labels**.

即：已放置的标签会成为后续标签的障碍物，逐个试候选位，全部试完仍冲突才按 `alwaysShow` 决定保留还是隐藏。**这正是「错开优先、隐藏兜底」，且是内置默认行为**（`alwaysShow` 默认 `true`，改成 `false` 即启用隐藏兜底）。

另有三级降级手段可叠加：`minimumFontSize`（自动缩字号找能放下的尺寸）、`wrapping`（换行）、`truncate`（省略号）。

### 重点核实：第 9 项（标记特定 x 值）

`crossLines` 是 Community 的坐标轴内置能力，**两种形态刚好对应两种需求**（`TYPES/chart/crossLineOptions.d.ts`）：

```ts
export interface AgRangeCrossLineOptions<...> extends AgCommonCrossLineOptions<...> {
    /** Renders the Cross Line as a shaded band spanning `range`. */
    type: 'range';
    /** The `[start, end]` data values bounding the shaded region. */
    range: [TValue, TValue];
    fill?: CssColor;
    fillOpacity?: Opacity;
}
export interface AgLineCrossLineOptions<...> extends AgCommonCrossLineOptions<...> {
    /** Renders the Cross Line as a single line positioned at `value`. */
    type: 'line';
    value: TValue;
}
```

柱图标记某列 → `type:'range'` 画色带；折线图标记某 x → `type:'line'` 画竖线。两者都支持 `label`（17 种位置枚举）、`stroke`/`strokeWidth`/`lineDash`。轴标签加粗则用 `axes.x.label.itemStyler` 回调，判断 value 命中就返回 `{ fontWeight: 'bold' }`。

**核实层级**：`crossLines` 出现在 `COMM` 的 `cartesianAxisOptionsDefs` 中（与 `crosshair`、`bandHighlight` 并列），manifest 里没有对应的 `enterprise: true` 模块 → **Community**。

### 补充：第 8 项（tooltip）细节

**tooltip 是 DOM 元素，不是画在 canvas 上的**——这让它比 canvas 内的一切都好定制。

- **`series[].tooltip.renderer` 是 Community**：类型 `TYPES/chart/tooltipOptions.ts:141`，实现 `packages/ag-charts-community/src/chart/series/seriesTooltip.ts:54`，是基类普通属性，无模块门控。
- **⚠️ 返回字符串会被当作原始 HTML 注入，不转义**（`seriesTooltip.ts:76-78` → `tooltipContent.ts:308` 的 `rawHtmlString`）。返回结构化对象 `{heading, title, symbol, data[]}` 才会走 `sanitizeHtml()`（`packages/ag-charts-community/src/util/sanitize.ts:5-12`）转义。**这个插件的数据来自用户 vault 里的 Markdown，若用字符串返回值拼接就是 XSS 面——应当用结构化返回值。**
- **20 个稳定 class 名**（`packages/ag-charts-community/src/chart/interaction/tooltipManager.css`，186 行）：`.ag-charts-tooltip`、`--compact`、`--dark`、`--wrap-always`/`--wrap-hyphenate`/`--wrap-on-space`/`--wrap-never`、`--arrow-top/right/bottom/left`、`-heading`、`-title`、`-label`、`-value`、`-content`、`-symbol`、`-row`、`-row--inline`、`-footer` 等。
- **CSS 自定义属性**（`packages/ag-charts-community/src/dom/theme.css:57-62`）：`--ag-charts-tooltip-{background-color, border-color, border-radius, border-width, text-color, subtle-text-color}`。**但该文件第 5-6 行注明「The values below are overridden, changing them here will have no effect」**——运行时由 `theme.params` 写入元素（`domManager.ts:580-594` 的 `setCSSVariables('--ag-charts', …)`）。要改样式请走 `theme.params.*` 或用更高优先级覆盖 class，**不要改 `:root` 上的这些变量**。
- `SeriesTooltip` 上有个内部 `class?: string` 字段（`seriesTooltip.ts:64`），**不可用**——未导出到 `ag-charts-types`，不在 options schema 里，代码中也从未被读取。

### 重点核实：第 13 项（数值标签描边）

**结论是「做不到」，且这是本次对照中唯一一项 AG Charts 不如现有实现的地方。**

证据链完整：
1. 标签样式的公开类型：`AgChartLabelStyleOptions extends Toggleable, TextOptions, LabelBoxOptions`（`TYPES/chart/labelOptions.d.ts:5`）
2. `TextOptions extends FontOptions { color?: AgCssColorOrRef }`（`TYPES/series/cartesian/commonOptions.d.ts:190-193`）——**只有颜色，无 stroke/strokeWidth**
3. `LabelBoxOptions extends FillOptions { border?, cornerRadius?, padding? }`（同文件 157-164）——`border` 是**盒子边框**不是文字描边
4. `itemStyler` 回调的返回类型同样是 `AgChartLabelStyleOptions`，无法绕过
5. 底层渲染层**有能力**：scene `Text` 节点实现了 `executeStroke(ctx) { this.renderLines((line,x,y) => ctx.strokeText(line,x,y)) }`（`COMM` 可 grep 到），但该能力未暴露为标签选项

**替代方案（推荐）**：用 `label.fill` + `label.padding` + `label.cornerRadius` 给标签加一个半透明色块底。目的（压在图形上也看得清）等效，视觉上更接近当代图表库的做法。另外 AG Charts 还提供 `insideStyle`/`outsideStyle`（`AgSeriesLabelPlacementStyleOptions`），**标签落在图形内/外时自动套用不同样式**——落在柱子内用白字、溢出到外面用正常字色，这本身就大幅降低了对描边的需求。

### 重点核实：第 11 项（主题跟随）——本次调研最大发现

问题原本是：**canvas 里读不到 CSS 变量，需要桥接吗？**

**答案：不需要，AG Charts 自己内置了完整的桥接 + 变更监听。**

**(a) 任意颜色值可直接写 `var(--x)`**。`ChartOptions.processCSSVariables()` 遍历整个 options 树（跳过 `data`），把 `var(--…)` 解析成实际颜色（`COMM`）：

```js
static isExternalColorVar(value) {
  return typeof value === "string" && value.startsWith("var(--") && !value.slice(4, -1).startsWith("--ag-charts");
}
static resolveColorVar(value, container) {
  const propertyKey = value.slice(4, -1);
  const [mainKey, ...fallbackKeys] = propertyKey.split(",");
  const computedStyle = getComputedStyle(container);
  let propertyValue = computedStyle.getPropertyValue(mainKey.trim());
  let isValid = Color7.validColorString(propertyValue);
  if (!isValid && fallbackKeys.length > 0) {
    const fallback = fallbackKeys.join(",").trim();
    if (fallback.startsWith("var(--")) return _ChartOptions.resolveColorVar(fallback, container);
    propertyValue = computedStyle.getPropertyValue(fallback) || fallback;
    isValid = Color7.validColorString(propertyValue);
  }
  return { isValid, propertyValue };
}
```

支持嵌套 fallback（`var(--a, var(--b))`）和字面量 fallback（`var(--a, #fff)`）；解析失败会 `warnOnce("CSS property [...] is not a valid color, ignoring.")` 并删掉该键。

**(b) CSS 变量变化时自动重渲染**——`DOMManager.updateCSSVariableWatchers()` 用了一个很聪明的办法（`COMM:358661` 起）：

```js
updateCSSVariableWatchers(cssVariables) {
  if (!cssVariables) return;
  if (this.shadowDocumentRoot) { this.updateCSSVariableWatchersShadowDOM(cssVariables); return; }
  for (const key of strictObjectKeys(cssVariables)) {
    const property = key.slice(4, -1);
    if (this.cssVariableWatchers.has(property)) continue;
    this.cssVariableWatchers.add(property);
    const styleElement = createStyleElement(this.styleNonce);
    styleElement.dataset.variableName = property;
    styleElement.textContent = `@property ${property} { syntax: '<color>'; inherits: true; initial-value: transparent; }`;
    this.element.prepend(styleElement);
    const sensorElement = createElement("div");
    sensorElement.style.setProperty("transition", `${property} 1ms`, "important");
    this.rootElements["style-sensors"].element.appendChild(sensorElement);
    const handleTransitionEnd = () => { this.eventsHub.emit("chart:request-refresh", null); };
    sensorElement.addEventListener("transitionend", handleTransitionEnd);
    …
  }
}
```

机制：给每个用到的 CSS 变量注册 `@property`（声明为 `<color>` 类型，使其可参与过渡）→ 建一个隐藏 sensor div，对该变量设 `transition: 1ms` → 变量值一变就触发 `transitionend` → 发出 `chart:request-refresh` → 图表用新解析值重绘。还有一条 Shadow DOM 专用路径。

**对这个插件的含义**：
- 颜色直接写 `var(--text-normal)`、`var(--background-primary)` 等 Obsidian 变量，无需自己读 `getComputedStyle`
- Obsidian 明暗主题切换时，**图表自动重绘，不需要销毁重建实例，不需要监听主题事件**
- 现有 `chart-theme.ts`（54 行）+ 主题重渲染逻辑基本可以整个删掉

**(c) 内置 12 套主题**（含 6 套暗色）：`'ag-default' | 'ag-default-dark' | 'ag-sheets' | 'ag-sheets-dark' | 'ag-polychroma' | 'ag-polychroma-dark' | 'ag-vivid' | 'ag-vivid-dark' | 'ag-material' | 'ag-material-dark' | 'ag-financial' | 'ag-financial-dark'`（`TYPES/chart/themeOptions.d.ts:48`）

**(d) `theme.params` 提供约 40 个全局参数**（`TYPES/chart/themeParamsOptions.d.ts`，195 行），且**大部分参数会互相派生**——只设 `backgroundColor` + `foregroundColor` 两项，文字、边框、网格线、tooltip 背景就都自动跟着算出来：

> **backgroundColor**: Background colour of the chart. **Most text, borders and backgrounds are defined as a blend between the background and foreground colours.**
> **textColor**: Default colour for all text. Default: `foregroundColor`
> **subtleTextColor**: Default: `foregroundColor + backgroundColor`

还有 `AgColorRef` 机制可以引用并混合其他参数：`{ ref: 'foregroundColor', mix: 0.5, ontoColor: 'var(--background-primary)' }`——`ontoColor` 的 JSDoc 明确写着「A literal CSS colour **or a `var(--css-variable)`**」。

**(e) 官方自己的 e2e 用例就是这个场景**：`packages/ag-charts-website/src/content/docs/themes-e2e/_examples/css-variables-dark-mode/main.ts` 通过 `document.body.classList.toggle('dark')` 切换，并打印 `"Mode: … — no chart.update() called"`。**与 Obsidian 明暗主题切换的机制完全一致。**

**(f) 换主题不需要销毁重建实例**。`packages/ag-charts-community/src/api/agCharts.ts:243-255` 显示只有两种情况会重建：实例为空、或**图表类型**发生变化——`theme` 根本不参与判断：

```ts
if (chart == null ||
    detectChartType(chartOptions.processedOptions) !== detectChartType(chart.chartOptions.processedOptions)) {
    create = true;
    chart = AgChartsInternal.createChartInstance(chartOptions, chart);
}
```

**两个约束**：
1. **处理选项时容器必须已在 DOM 中**——`optionsModule.ts:1728`：`if (container == null) return;`。插件里要确保挂载后再创建图表。
2. `--ag-charts*` 前缀的变量被排除在此机制外（那是 AG 自己向外写的变量，不向内读）。

**没有公开的主题变更事件**（`TYPES/chart/eventOptions.d.ts` 无相关事件；内部的 `theme:params-change`、`chart:request-refresh` 均为私有）。但因为上面的自动重绘机制存在，**也不需要**。

**这一项从「插件花工时最多之一」直接降为「写 5-10 行 theme.params」。**

---

## 4. 硬约束核验

### 许可证 → ✅ 通过

Community 是**无附加条款的标准 MIT**，可闭源、可商用、可随开源插件分发、可用于公司内部文档。唯一红线：**绝不能捆绑 `ag-charts-enterprise`**——EULA 3.3 禁止随 Application 再授权给第三方，且缺 key 时会在**用户端**（非 localhost）显示水印。

### 体积 → ✅ 通过，且优于现状

实测数据（esbuild 0.28.2，`--bundle --minify --platform=browser --format=cjs`）：

| 方案 | target | 原始 | gzip |
|---|---|---|---|
| **ag-charts-community 14.1.0**（只 import `AgCharts`，用 bar+line） | es2017 | **1,294,880 B (1.23 MB)** | **387,849 B (379 KB)** |
| ag-charts-community（`import * as`，全量） | es2017 | 1,388,400 B | 415,543 B |
| ag-charts-community（只 bar+line） | es2020 | 1,239,892 B | 370,891 B |
| **@ant-design/plots 2.6.8**（Column+Line+DualAxes，react external）*现状* | es2017 | **1,535,071 B (1.46 MB)** | **452,126 B (441 KB)** |
| @antv/g2 5.4.8（只 `Chart`） | es2017 | 1,370,162 B | 406,334 B |

**结论：换成 AG Charts Community，打包产物比现在小约 240 KB（原始）/ 64 KB（gzip），约 -16%。**

**能 tree-shake 吗？基本不能，但不重要。** 只 import `AgCharts` 与全量 `import *` 只差 **7%**（1.29 MB vs 1.39 MB）——因为发布产物是**单文件预打包 bundle**，模块注册表把各 series 串在一起。所以「只用柱/折线/组合能多小」的答案是：**省不了多少，就是约 1.23 MB**。好消息是这个尺寸本来就比现状小。

官方发布产物本身的尺寸（`TAR/ag-charts-community/dist/package/`）：`main.esm.min.mjs` = 1,203,459 B，gzip 353,600 B，brotli 281,246 B。

### ES2017 → ⚠️ 需自行降级，但可行且已实测通过

**官方发布产物的实际 target 是 ES2020，不是 ES2017。** 对 `main.esm.min.mjs` 的语法特征统计：

| 语法 | 出现次数 | 引入版本 |
|---|---|---|
| 可选链 `?.` | 1698 | ES2020 |
| 空值合并 `??` | 1447 | ES2020 |
| 对象展开 `{...}` | 349 | ES2018 |
| 可选 catch 绑定 `catch{` | 17 | ES2019 |
| 逻辑赋值 `??=`/`\|\|=`/`&&=` | 0 | — |
| 私有字段 `#x` | 0 | — |
| static 块 | 0 | — |

`package.json` 的 `browserslist` 为 `["> 1%","last 2 versions","not ie >= 0", …]`，未声明具体 ES target。

**但这不构成阻碍**：esbuild 以 `--target=es2017` 打包时会把依赖一并降级。实测验证——es2020 产物含 1720 处 `?.` 和 1492 处 `??`，es2017 产物降到 **0 处 `??`、6 处 `?.`（均在字符串/正则字面量内）**，`{...}` 和 `catch{` 均归零。代价是体积 +55 KB（1.24 MB → 1.29 MB），已计入上表。

**注意**：项目的打包配置必须确保 **不排除 node_modules**（即 AG Charts 要参与 bundle 而非 external），否则未降级的 ES2020 语法会直接进产物。

### canvas / PNG → ✅ 通过

- **canvas 确认**：渲染层是 canvas 2D（`COMM` 中大量 `ctx.fillText`/`strokeText`/`strokeRect`/`getContext`，scene 图形节点通过 `executeFill`/`executeStroke` 落到 canvas API）。tooltip、图例交互层、水印是 DOM overlay。
- **PNG 导出是官方 API，Community**：
  ```ts
  /** Starts a browser-based image download for the given `AgChartInstance`.
   *  @returns a `Promise` that resolves once the download has been initiated. */
  download(options?: DownloadOptions): Promise<void>;
  /** Returns a base64-encoded image data URL for the given `AgChartInstance`. */
  getImageDataURL(options?: ImageDataUrlOptions): Promise<string>;
  ```
  （`TYPES/chartBuilderOptions.d.ts:102-113`）
  选项：`fileName`、`width`、`height`、`fileFormat`（`'image/png'` 默认 / `'image/jpeg'`）（同文件 138-149）。
  实现链路：`packages/ag-charts-community/src/chart/chartProxy.ts:179`（`download`）/ `:201`（`getImageDataURL`）→ `chart.ts:366` → `scene.ts:151-157` → `packages/ag-charts-community/src/scene/canvas/hdpiCanvas.ts:59-61` 的 `this.element.toDataURL(type)`。全部在 `ag-charts-community/src` 内，是 `AgChartInstance` 基类方法，无需模块注册 → **Community**。
- **异步、返回 Promise、可离屏工作**：两个方法都会通过 `prepareResizedChart()` 克隆一个离屏图表、`await cloneProxy.waitForUpdate()` 渲染完再 `clone.destroy()`（`chartProxy.ts:179-209, 283-320`）。同时指定 `width` 和 `height` 会强制 `overrideDevicePixelRatio = 1`。**必须 await，不能同步取。**
- **导出产物干净无水印**：水印只在「加载了 Enterprise 且无 License」时才加，且有显式守卫 `if (ModuleRegistry.isEnterprise())`（`chartProxy.ts:289-298`）。**纯 Community 导出永远不带水印。**
- 另有一个未文档化的 `__toSVG(opts)`（`chartProxy.ts:189`），不建议依赖。
- **UI 按钮确实是 Enterprise**：右键菜单的「Download」项定义在 `packages/ag-charts-community/src/chart/interaction/contextMenuTypes.ts:109-116`，而 `contextMenu`（`expectedModules.ts:389-394`）与 `chartToolbar`（`:382-388`）都标了 `enterprise: true`。**净结论：PNG 导出能力免费，只有内置的右键/工具栏按钮要钱——插件自己接一个按钮即可。**
- **官方文档同向确认**（https://www.ag-grid.com/charts/javascript/community-vs-enterprise/ 的 Community Features 段）：
  > **Download API** — Trigger browser-based image downloads of Charts in Base64 and PNG.

### 主题切换 → ✅ 通过（且大幅优于预期）

**不需要销毁重建实例。** 三条路径任选：

1. **最省事**：颜色直接写 `var(--obsidian-变量)`，AG Charts 自动解析 + 自动监听变化重绘（见第 3 节第 11 项详述）。**这一条基本让主题跟随变成零代码。**
2. `chartInstance.updateDelta({ theme: {...} })` 局部更新（`TYPES/chartBuilderOptions.d.ts:91`）
3. 切换内置暗色主题 id（`'ag-default'` ↔ `'ag-default-dark'`）

**「canvas 里读不到 CSS 变量」这个顾虑不成立**——AG Charts 用 `getComputedStyle(container).getPropertyValue()` 读取，再用 `@property` + `transition`/`transitionend` 监听变化，桥接是库自己做的。

### CJK → ⚠️ 引擎本身完全胜任，但**默认值对中文不友好，必须逐处显式覆盖**

**这是本次调研中风险最高、最容易踩坑的一项。**

**引擎能力：合格。**
- **文本测量**：canvas `measureText`，带按字体缓存（`packages/ag-charts-core/src/rendering/textMeasurer.ts:20,47,83-96`）。按真实字形宽度测量，中文宽度正确。字体加载竞态由 `packages/ag-charts-community/src/chart/fonts/fontManager.ts:101-125` 的 `ResizeObserver` 探针处理。无硬编码字体度量表。
- **换行是字素（grapheme）级，不是单词级**——每个汉字自成一个单位（`packages/ag-charts-core/src/utils/text/textUtils.ts:214-220`）：
  ```ts
  export function graphemeSegments(text: string): string[] {
      if (graphemeSegmenter) return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
      return Array.from(text);  // fallback: 码点级
  }
  ```
  截断 `truncateLine()` 同样走 `graphemeSegments`（`textWrapper.ts:262-286`），不会切碎代理对。

**问题在默认值。** 关键分支在 `packages/ag-charts-core/src/utils/text/textWrapper.ts:307-308`：

```ts
const wrapHyphenate = options.textWrap === 'hyphenate';
const wrapOnSpace  = options.textWrap == null || options.textWrap === 'on-space';
```

对一个**没有空格的中文长串**，`lastSpaceIndex` 恒为 0，于是：

| `wrapping` 值 | 中文长串的实际行为 |
|---|---|
| `'on-space'`（含未设置） | **不换行，直接截断加省略号**（`textWrapper.ts:391-401`） |
| `'always'` | **正常换行**，按字素边界切（`:403-423`）✅ |
| `'hyphenate'` | 会换行，但**每个断点插一个字面 `-`**（`:403` `postfix = '-'`，`:415`）——中文里是错的 |
| `'never'` | 完全不换行 |

**各处的实际默认值**（全部需要覆盖）：

| 位置 | 默认 `wrapping` | 中文后果 | 依据 |
|---|---|---|---|
| **类目轴刻度标签** | `'on-space'` | **静默截断** ⚠️ 影响最大 | `packages/ag-charts-community/src/module/axis-modules/categoryAxisModule.ts:29` |
| 分组类目轴标签 | `'on-space'` | 静默截断 | `.../groupedCategoryAxisModule.ts:27` |
| **系列数据标签** | **`'never'`** | 完全不换行 | `packages/ag-charts-community/src/chart/series/seriesLabelProperties.ts:59` |
| **tooltip** | `'hyphenate'` | **插入多余 `-`** | `packages/ag-charts-community/src/chart/tooltip/tooltip.ts:143` |
| **图表标题/副标题/脚注** | `'hyphenate'` | **插入多余 `-`** | `packages/ag-charts-community/src/chart/themes/chartTheme.ts:267,280,293` |
| 轴标题 | `'always'` | ✅ 正常 | `packages/ag-charts-community/src/chart/themes/axisThemeTemplate.ts:17` |
| 自适应标签（treemap 等） | `'on-space'` | 静默截断 | `TYPES/chart/labelOptions.d.ts:148` |

**结论：中文场景必须在轴标签、数据标签、tooltip、标题/副标题/脚注五处显式写 `wrapping: 'always'`。约 5 行配置，但漏掉任何一处都会出现截断或多余连字符。**

**另外两个坑**：
1. **轴刻度标签只在 `avoidCollisions` 为 true 时才换行**——`packages/ag-charts-community/src/chart/axis/generateTicksUtils.ts:246`：`if (label.avoidCollisions) { wrappedLabel = wrapTextOrSegments(...) }`。默认是 `true`（`axisThemeTemplate.ts:77`），但一旦设成 `false` 就连换行也一起关掉了。
2. **运行时兜底值与文档默认值不一致**——`generateTicksUtils.ts:237` 读的是 `textWrap: label.wrapping ?? 'never'`。凡是模块模板没提供 `wrapping` 的轴（即非 category 轴），兜底是 `'never'` 而非 `'on-space'`。

**无 CJK 专门处理**：全库 grep `Intl.Segmenter` 之外的 `\p{Script`、`CJK`、`isCJK`、`wordBreak` 均零命中，不做中日韩禁则处理（行首避头点 `。，、）` 等）。基础换行没问题，排版讲究度不如专业排版引擎。

**UI 文案本地化**：`ag-charts-locale` 提供 `zh-CN`/`zh-HK`/`zh-TW`。仅影响无障碍标签与 Enterprise UI 控件文案，对本项目意义不大。

### 响应式 → ✅ 通过（默认开启且无法关闭）

**v14 已经没有 `autoSize` 选项了**——`grep -rn "autoSize" packages/ag-charts-types/src/` 零命中，跟随容器现在是无条件行为。

`ResizeObserver` 每个 document wrapper 创建一次（`packages/ag-charts-core/src/utils/dom/agDocument.ts:233-234`），由 `SizeMonitor` 驱动（`packages/ag-charts-community/src/util/sizeMonitor.ts:27-34`）；容器在 attach 时被无条件 observe（`packages/ag-charts-community/src/dom/domManager.ts:544-553`），最终落到 `Chart.resize()`（`chart.ts:1389-1395`）。

显式尺寸优先于观测尺寸：`chart.ts:1416-1418` — `const width = inWidth ?? this.width ?? this._lastAutoSize?.[0];`

选项（`TYPES/chart/chartOptions.d.ts:238-253`）：`width`、`height`、`minWidth`、`minHeight`（后两者「Ignored if `width`/`height` is specified」，且可运行时更新）。

三个工程细节值得一提：另有 `PixelRatioObserver` 处理显示器 DPI 变化（`sizeMonitor.ts:41-49`）；observe 会延迟到 `document.readyState === 'complete'` 以避免首次误触发（`:52-60`）；尺寸向下取整，注释写明*「a fractional size ping-pongs the ResizeObserver by 1px」*（`domManager.ts:463`）。

### 依赖 → ✅ 通过，"no third-party dependencies" 属实

实测 `npm i ag-charts-community` 完整依赖树只有 4 个 AG 自家包，**非 AG 包数量为 0**（见第 1 节）。

这不是巧合，是他们的硬性内部规则——`REPO/AGENTS.md`「Critical Rules」：

> **Zero runtime dependencies:** Community and enterprise runtime bundles must have **ZERO third-party dependencies** beyond AG Charts packages.

（例外：`ag-charts-server-side` 依赖 `jsdom` + `skia-canvas`，但那是服务端渲染包，Commercial，本项目不涉及。）

**对比现状**：`@ant-design/plots@2.6.8` 装入 93 个包。这对一个需要用户下载的社区插件是实打实的供应链风险差异。

### 维护活跃度 → ✅ 优秀

发版节奏（npm registry `time` 字段 + GitHub Releases）：

| 版本 | 日期 |
|---|---|
| 14.1.0 | 2026-08-05 |
| 14.0.2 | 2026-07-22 |
| 14.0.1 | 2026-07-15 |
| 14.0.0 | 2026-06-24 |
| 13.3.1 | 2026-06-02 |
| 13.3.0 | 2026-05-12 |
| 13.2.1 | 2026-04-07 |
| 13.2.0 | 2026-03-25 |
| 13.1.0 | 2026-02-11 |
| 13.0.1 | 2026-01-22 |
| 13.0.0 | 2025-12-10 |

**近一年 11 次发版，平均约 5 周一次，大版本约每半年一次。** 商业公司（AG GRID LTD，注册号 07318192）维护，Enterprise 收入直接供养 Community 开发。仓库有完整的 CI、e2e、图像快照测试（`__image_snapshots__`），以及给 AI agent 写的开发规范。

**风险提示**：大版本（13→14）间有**破坏性 API 变更**——本次就发现 `axes` 从数组改为字典、`axes[].keys` 被 `series[].yKeyAxis` 取代。半年一个大版本意味着需要定期跟进迁移。

---

## 5. 迁移成本估算

**现状**：与引擎耦合的代码约 **1100 行**（`chart-tag-config.mjs` 1048 行 + `chart-theme.ts` 54 行），另有 1835 行图表测试。解析层、入口层、区块组件约 3700 行**完全不受影响**。

### 需要重写

| 部分 | 现有规模 | 迁移后预估 | 说明 |
|---|---|---|---|
| `chart-tag-config.mjs`（配置生成） | 1048 行 | **约 250–400 行** | 从「G2 spec 拼装 + 大量手工排布计算」变成「填 AG Charts options 对象」。API 形态差异大，是重写不是改写 |
| `chart-theme.ts`（主题桥接） | 54 行 | **约 5–15 行** | 大部分能直接删（见下） |
| 图表测试 | 1835 行 | **需大改** | 断言的是 G2 spec 结构，引擎换了断言全部失效。若测试是「生成的 options 对象长什么样」，改写量与配置层同级 |

### 可以直接删掉的（库已内置）

| 现有能力 | 删除理由 |
|---|---|
| **主题跟随 / CSS 变量解析 / 主题切换重渲染** | AG Charts 原生支持 `var(--x)` 解析 + `@property` 变更监听自动重绘。这是最大的一块净删除 |
| **数据标签防碰撞（错开 + 隐藏）** | `label.collision.alwaysShow` + `placements` 有序候选位，2294 行的排布引擎替你做 |
| **堆叠柱标签居中 / 薄段处理** | `placement: 'inside-center'` 默认 + `beside-*` 回退 + `minimumFontSize` |
| **负值标签方向翻转** | 内置默认行为 |
| **y 轴刻度凑整** | `nice` 默认 `true` |
| **PNG 导出的 canvas 拼装** | `getImageDataURL()` / `download()` |
| **容器尺寸响应** | 内置 `ResizeObserver`，v14 已无 `autoSize` 开关，无条件跟随 |
| **图例横杠标记的手工绘制** | `legend.item.line.{length,strokeWidth}`，且 `showSeriesStroke` 默认已开 |
| **标记特定 x 的静态色带/竖线** | `axes.x.crossLines[]`（`type:'range'` / `type:'line'`） |

### 反而要新增的代码

| 项 | 规模 | 说明 |
|---|---|---|
| **⚠️ 悬停列背景带 / 竖线（第 15 项）** | **约 40–80 行** | `crosshair` 与 `bandHighlight` 都是 Enterprise。Community 下需监听 highlight 事件、动态改写 `axes.x.crossLines`、自己做状态管理与节流。**这是唯一一处「原来有、迁移后要重新自己写」的能力** |
| **中文换行显式配置** | 约 5 行 | 轴标签、数据标签、tooltip、标题/副标题/脚注五处都要显式写 `wrapping: 'always'`，否则会静默截断或插入多余 `-` |
| **y 轴 8% 留白** | 约 3–5 行 | 需自己算 `dataMax` 后设 `preferredMax = dataMax * 1.08`。无原生百分比留白选项 |
| **数值标签描边的替代实现** | 约 2–5 行 | 改用 `label.fill`/`padding`/`cornerRadius` 色块底，或用 `insideStyle`/`outsideStyle` 内外分色。若坚持要文字光晕则**做不到** |
| **PNG 导出按钮 UI** | 约 10–20 行 | 编程 API 是 Community，但按钮 UI 属 Enterprise 的 toolbar/contextMenu，需自己接 |
| **`axes` 字典模型的适配** | 已计入配置层重写 | v14 的新模型，不是额外成本 |

### 净估算

**配置层 1048 行 → 约 250–400 行（含上表新增的约 60–115 行），净减少约 650–800 行。** 加上 `chart-theme.ts` 从 54 行降到约 5–15 行。

**测试 1835 行需要同级别改写**——断言的是 G2 spec 结构，引擎换了全部失效。**这是迁移的主要工时，而非配置层本身。**

**总体判断：这是一次「代码变少、能力变强」的迁移**，但一次性成本集中在测试重写上，且有一处能力回退（第 15 项悬停高亮要自己写）。

**建议的验证顺序**（按风险从高到低，任何一项不过就不必往下走）：

1. **`@property` + `transitionend` 在 Obsidian/Electron 里是否可用** —— 这是「主题跟随几乎零成本」这条最大优势的唯一风险点，不成立的话最大收益就没了
2. **中文标签的实际渲染** —— 显式设 `wrapping: 'always'` 后，轴标签/数据标签/tooltip 的断行位置是否可接受
3. **双轴组合图原型** —— 顺带验证第 2、4、13 项（防碰撞、薄堆叠段、标签色块底）的实际观感
4. **第 15 项悬停高亮的自实现原型** —— 确认 40–80 行的估算是否成立

---

## 6. 三个最大优势 / 三个最大短板

### 优势

1. **CSS 变量原生桥接 + 自动重绘，Obsidian 主题跟随几乎零成本。**
   这是针对**这个场景**最有价值的一点。一个 canvas 图表库主动去做 `getComputedStyle` 解析 + `@property`/`transitionend` 变更监听，是很罕见的工程投入。它把这个插件目前最费工时、最容易出 bug 的一块（主题切换重建、颜色桥接）直接消掉。

2. **标签排布是一个真正的引擎，不是几个 if。**
   `labelPlacement.ts` 2294 行，带空间索引、障碍物模型、有序候选位、旋转外接矩形、字号自适应降级。公开 API 就是「试错开 → 试缩字号 → 试换行 → 隐藏」四级降级，全部靠配置。使用者诉求里的「数字放在哪儿、水平碰撞渲染，这些你都不用去考虑」，这一条是实打实做到了。

3. **零第三方依赖 + 体积反而更小 + 商业公司稳定维护。**
   4 个自家包对 93 个包；1.23 MB 对 1.46 MB；近一年 11 次发版。对一个要用户下载、要长期维护的社区插件，这三点都是硬收益。

### 短板

1. **图形类型广度严重不足，且钱也不一定能解决。**
   Community 只有 8 种 series。付 $499/开发者升到 Enterprise 能补上雷达、热力图、桑基、树图、地图、仪表盘，但**网络图、流程图、思维导图、甘特图、词云、时间线、平行坐标——花钱也买不到，AG 整个产品线就不做**。如果选型目标里有「一家覆盖全」，AG Charts 直接出局。

2. **Enterprise 边界卡在几个「看起来该免费」的地方：动画、悬停高亮。**
   `animation` 是 `enterprise: true` 的插件模块，即 **Community 版图表没有入场/更新动画**。更直接影响本项目的是 **`crosshair` 和 `bandHighlight` 也是 Enterprise**——第 15 项「悬停时的列背景带/竖线」这个现有能力，迁移后要自己重写。同样落在 Enterprise 的还有：缩放、导航条、标注、右键菜单、渐变图例、误差棒、极坐标轴。对「渲染效果更现代化、美观」这条诉求，无动画是可感知的减分项——虽然对 Obsidian 笔记里的静态图表而言影响有限，甚至可能是优点。

3. **中文默认值是坑，数值标签无法描边，且大版本有破坏性变更。**
   **默认 `wrapping` 对中文是错的**：类目轴标签默认 `'on-space'` 会静默截断中文，tooltip 和标题默认 `'hyphenate'` 会在汉字之间插入 `-`。不踩这个坑需要在五处显式配置——虽然只有 5 行，但**不知道就会中招，而且症状是「静默」的**。第 13 项文字描边是 16 项里唯一的「做不到」（`TextOptions` 只有 `color`，底层 `strokeText` 未暴露），虽有等效替代但视觉会有落差。另外 13→14 已发生 `axes` 数组→字典的破坏性变更，半年一个大版本意味着持续的迁移维护成本。

---

## 7. 不确定的地方

以下各项**查不到或未验证**，不做推测：

1. **纯内部使用者（不开发、不分发）是否需要 Enterprise 授权——EULA 无对应条文。** EULA 只约束 Licensee，计费单位是开发该 Application 的前端 JS 开发者；一个只是"用别人写的开源插件"的公司此时零开发者。**查不到，需向 AG Grid 销售取得书面确认。** 另外「Obsidian 插件是否落入 3.7(b) 的 development toolkit/library」条款把解释权留给了 AG Grid（"as determined by the Licensor"），同样**无法自行判定**。

2. **histogram 的层级归属存在仓库内部矛盾，建议当作 Enterprise 对待。**
   同一个 commit 里两处自相矛盾：
   - **模块清单说 Community**：`expectedModules.ts:203-209` 的 `enterprise: true` 被注释掉，且 `HistogramSeriesModule` 由 `ag-charts-community/src/main.ts:24` 导出、被 `module-bundles/cartesian-series.ts:14` 纳入 Community bundle。已发布 tarball 中该注释原样保留。
   - **官方文档说 Enterprise**：`packages/ag-charts-website/src/content/docs/histogram-series/index.mdoc` 的 frontmatter 明写 `enterprise: true`，与 heatmap 等真 Enterprise 页面完全一致（对照 `line-series/index.mdoc` 无此字段）。

   **运行时行为由模块清单决定，所以它现在确实能在 Community 里跑。但供应商的意图（文档）是收费。** 无法判断这是「有意下放到 Community 但文档没跟上」还是「误注释」——**任何一个版本都可能把这行注释放开**。结论：能用，但**不要把它作为选型依据，也不要在产品里依赖它**。

3. **实际渲染效果没有跑过——这是本报告最大的整体局限。** 全部结论来自类型定义与实现源码，**没有真正渲染出一张图**。尤其这几项需要实测：
   - 第 2 项防碰撞在密集中文标签下的真实表现
   - 第 4 项薄堆叠段的 `beside-*` 回退实际观感
   - 第 13 项 `label.fill` 色块底的视觉是否可接受
   - CJK 在 `wrapping: 'always'` 下的断行位置是否符合中文习惯

4. **Obsidian/Electron 环境下 `@property` 的可用性未验证。** CSS 变量自动跟随依赖 `@property` at-rule 与 `transitionend` 事件。Electron 的 Chromium 版本足够新时没问题，但**未在实际 Obsidian 环境中验证**。这是「主题跟随几乎零成本」这条最大优势的唯一风险点，**建议第一个验证**。

5. **`legend.item.marker.padding` 的确切视觉效果未验证。** JSDoc 说是「marker 与 label 之间的 padding」，默认 8，实现中用作 `markerLabel.spacing`。需求要 4px，配置存在，但**未验证设成 4 之后的实际间距**是否恰好 4px（可能还叠加其他 spacing）。

6. **`preferredMax` 未实测。** 「用 `preferredMax` 实现 8% 留白且不关掉 nice」是读 `normalisedExtentWithMetadata` 与 `getDomainExtentsNice()` 推导的，**没有跑过验证 nice 与 preferredMax 叠加后的最终刻度**。

7. **Community 下自实现悬停高亮的可行性未验证。** 报告给的路径（监听 highlight 事件 → 动态改写 `crossLines`）是按可用 API 推导的，**没有写过原型**，40–80 行的估算因此不确定。

8. **`ag-charts-locale` 对打包体积的影响未细查。** 它是 `ag-charts-community` 的直接依赖（解包 4 MB，31 种语言），实测总包体 1.23 MB 说明未全量打入，但**未确认是否有部分 locale 数据被静态引入**。

9. **issue 响应速度未调查。** 只统计了发版节奏，**没有抽样 GitHub issue 的首次响应时间与关闭率**。「维护活跃度」的结论仅覆盖发版频率这一个维度。

10. **Enterprise 试用期条款未与官网核对。** 包内 EULA 写明试用为 60 天（30 天试用 + 30 天洽谈期），期间「Software may place watermarks on output」。**未核对官网 trial 流程的实际条款**是否与包内 EULA 一致。

11. **证据链说明。** 前两次 `git clone` 中途被 git 自身清理（`fetch-pack: invalid index-pack output`），第三次成功（commit `2001e0c`，2026-08-14）——第 15 项的修正即由它最终确认，且**报告中全部 15 处 `REPO` 路径引用已在 clone 成功后逐一复核存在**。仓库版本是 `14.1.0-beta.20260809`，tarball 是正式版 `14.1.0`，二者在本报告涉及的结论上未发现差异。仓库里的 `packages/ag-charts-website` 与 `packages/ag-charts-community-examples` 是完整的，但**本次未系统阅读其中的可运行示例**——报告里的配置片段都是按已验证的类型定义手写的，**未经运行验证**。
