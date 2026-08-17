---
last_updated: 2026-08-15
---

# AGENTS.md - Mosaic

AI agent 工作规则。
AI agent（Claude Code / Codex / Gemini CLI 等）**必读**，并遵守其中规则。
本文件是本仓库 AI agent 工作规则的唯一 SSOT。`CLAUDE.md` 只通过 `@AGENTS.md` 引用本文件。

## Repo purpose

Mosaic 是 Obsidian 社区插件（plugin id `mosaic`，GitHub `GilbertzzzZZ/mosaic`）：声明式内容块渲染引擎——在 Markdown（`.md`/`.mdx`）正文里写一段声明，阅读视图就地渲染为富交互内容。当前支持六类内容块：Chart（AntV 图表，三种写法）、DataTable、MetricGrid、Timeline、DecisionBox、FlowDiagram。

产品定位与 Roadmap 见 [docs/mosaic-intro.md](docs/mosaic-intro.md)（en 为准，zh 为镜像翻译）。

## 架构：三区块

```
入口（src/entry/）    只识别两种物理形式，产出结构完全相同（类型 + 属性表
                      + body）——解析层与渲染层不知道内容来自哪种写法。
                      chart-tag-processor（六类标签，代际 token 防重入）
                      block-processor（六类代码块，按组件名分发）
解析（src/parse/）    纯函数，零 Obsidian 依赖（obsidian-dataset.ts 除外，
                      是 vault IO 适配）。blocks/ 子目录是已定型的数据层
                      实现——只报真 bug，不做风格重构，改动面压到最小。
渲染（src/render/）   自己的壳（figure/工具栏/脚注/错误框）+ 按需调库
                      （AntV 出图）。render-chart（Chart 分发）、
                      render-component（五类分发）、components/ 视图。
```

- 标签名唯一权威清单：`COMPONENT_NAMES`（src/parse/chart-tag.mjs），入口 FAST_PATH 与 OPEN_TAG 由它构造；渲染映射在 render-component 的 PLAIN_VIEWS。
- 代码块语言名 ↔ 组件名的唯一映射：`BLOCK_LANGUAGES`（同文件），由 `COMPONENT_NAMES` 派生（组件名转小写）+ 历史别名 `chartview` → Chart。加一类内容块仍然只改 `COMPONENT_NAMES` 一处。
- 调用方向只允许 entry → parse/render、render → parse，禁止逆向依赖。

## File structure

```
mosaic/
├── src/                  # 三层源码（见上）
├── tests/                # node --test，只测 parse/render 的纯函数 .mjs
├── docs/
│   ├── _archive/         # 已完成 plan 的归档；每份顶部有状态块，记录落点与
│   │                     # **后来被推翻的项**——那才是归档的价值所在
│   ├── _assets/          # 文档截图（模拟英文假数据，dark 主题实拍）
│   ├── design/           # 每个区块的设计文档（why 与机制，无代码）
│   ├── guides/           # 明细指导：各区块用法 / dataset 契约 / 发版操作步骤
│   ├── policies/         # 发版须遵守的 Obsidian 官方规范原文归档（带 source url），
│   │                     # 文件名统一 obsidian- 前缀，与 Mosaic 自己的规则区分
│   ├── plans/            # 实施计划，随仓库分发
│   ├── research/         # 调研档案；现存三份图表引擎横评（AntV / ECharts /
│   │                     # AG Charts），换引擎的决策尚未做出
│   └── *.md              # 介绍类：mosaic-intro（en 为准）与 zh 镜像
├── styles.css            # 插件样式（发布三件套之一）
├── manifest.json         # 插件清单（发布三件套之一）
└── esbuild.config.mjs    # 构建：tsc typecheck + esbuild bundle → main.js
```

- `main.js` 是构建产物，不进 git；分发走 GitHub Releases 三件套（main.js/manifest.json/styles.css）。

## 开发命令

```bash
npm test               # node --test，全绿是任何提交的前提
npm run build          # tsc（noEmit typecheck）+ esbuild production
npm run install:vault  # build + 拷三件套到测试 vault
```

## 测试 vault（真机验证）

- 位置 `测试 vault`——**它自己是一个独立的 git 仓库**（本地，无 remote），不是本仓库的子目录，也不会被本仓库跟踪。不要用其他生产 vault 做测试。
- 改测试库前先 `git -C 测试 vault status` 看清工作区；写坏了 `git checkout` 就能回退，不需要手工备份。`.obsidian/` 不进 git（宿主状态，随每次部署和插件开关而变）。
- **只放单元测试验不了的东西**。338 条单测已覆盖纯函数层（解析产物、配置对象、错误文案），这里验的是：画出来什么样、换写法结果一不一致、宿主行为、错误框出现在哪、给人看的效果。纯函数能验的一律不放——别名链就是反例，`tests/payload.test.mjs` 已有三条 `alias chain fallbacks`。
- **一份文件 = 一条可验证的断言，文件名说清验什么，不用编号**。六个类型目录下是能力名（`line.md` / `granularity.md` / `payload-forms.md` / `errors.md` …）。
- **同一能力的所有写法放在同一份文件里**，小节标题固定 `## 代码块 · 内联` / `## 代码块 · 外部` / `## 标签 · 内联` / `## 标签 · 外部`，四段画同一张图——等价性验证是一屏之内的视觉对照，不是跨文件记忆对照。只有 Chart 与 DataTable 有四段，其余四类只有 `## 代码块` 与 `## 标签`（外部数据只这两类支持）。
- `host-behavior/` 验宿主而非某个类型（主题切换、虚拟化与宽度、段落接管、插件启停）；`cases/` 是四篇模拟场景报告，效果呈现，写法刻意混杂且每篇留两处故意写错；`_assets/` 是数据文件；`_readme/` 是 README 截图专用页。
- 每个 `.md` 都有一份**逐字节相同**的 `.mdx`（库根 `README.md` 除外），用 `sync-mdx.sh` 维护；新增和改动都要成对。
- 库根 `README.md` 是这套结构的 SSOT，改结构先改它。
- obsidian CLI（obsidian-cli 桥）：`obsidian vault=mosaic-test-vault eval code='...'`；restricted mode 用 `app.plugins.setEnable(true)` 解除。
- 插件增删一律 `disablePluginAndSave`/`enablePluginAndSave`（纯 disablePlugin 会被 Obsidian 内存态写回复活）。
- 截图管线：JXA CGWindowList 取 Obsidian 窗口 id → `screencapture -x -o -l <id>` → ffmpeg 裁剪；只截 Obsidian 窗口，内容必须是模拟英文假数据。

## 已固化的陷阱（改渲染链路前必读）

1. **渲染时机**：Obsidian 打开文件时会在 section 未挂载（宽 0）或 ~330px 测量容器中调用 post-processor。渲染必须等 `whenHostReady`（无超时版——超时会造成永久空段落）+ ChartFigure 宽度监听就地重建。`stale()` 必须并入入口的 `unloaded` 标志，否则 host-ready 轮询对 detached 节点泄漏。
2. **主题切换**：走 `mosaic:theme-change` 自定义事件就地换肤，绝不能改回 `rerender(true)`（与阅读视图虚拟化竞态会丢图）；插件禁用窗口期的空段落由 onload 的 `rerenderOpenPreviews()`（私有 API rebuildView 可选调用）兜底。
3. **虚拟化假象**：用 obsidian CLI 查 DOM 时，视口外 section 未物化——统计错误框/图表数前要把 scroller `scrollTop` 拉到底，否则会把「没渲染」误判成回归。
4. **成对标签的 CommonMark 边界**：开标签必须单行、标签体内不能有空行——这是宿主段落切分规则，不是插件 bug，文档已固化说明。

## 上架合规（marketplace）

- 官方规范原文归档在 [docs/policies/](docs/policies/)，四篇均带 `obsidian-` 前缀：developer-policies、submission-requirements、plugin-guidelines、plugin-self-critique-checklist。改 UI/设置页/manifest 前先对照。
- 发版操作步骤在 [docs/guides/publishing-to-obsidian.md](docs/guides/publishing-to-obsidian.md)。注意官方流程已改版：提交社区目录走 community.obsidian.md，**不再向 obsidian-releases 提 PR**。
- 已达成并必须保持：无 console 噪音、无 innerHTML、无网络请求、无遥测、UI 文案英文 sentence case、设置页无标题、build 必过 typecheck、`main.js` 不进 git。

## Git 规则

- 遵守全局 Git Protocol（分支 → commit+push → PR → merge 后清理）；默认不在 main 上 commit。
- commit 前必须 `npm test` 全绿 + `npm run build` 通过。
