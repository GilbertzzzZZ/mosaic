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
入口（src/entry/）    识别 + 生命周期。两个 processor：
                      chart-tag-processor（六类标签，代际 token 防重入）
                      chart-block-processor（```chartview 代码块）
解析（src/parse/）    纯函数，零 Obsidian 依赖（obsidian-dataset.ts 除外，
                      是 vault IO 适配）。blocks/ 子目录是 早期内部实现 逐字
                      移植件（Apache-2.0，见 NOTICE）——只报真 bug，
                      不做风格重构，保持与 早期内部实现 原文可 diff。
渲染（src/render/）   自己的壳（figure/工具栏/脚注/错误框）+ 按需调库
                      （AntV 出图）。render-chart（Chart 分发）、
                      render-component（五类分发）、components/ 视图。
```

- 标签名唯一权威清单：`COMPONENT_NAMES`（src/parse/chart-tag.mjs），入口 FAST_PATH 与 OPEN_TAG 由它构造；渲染映射在 render-component 的 PLAIN_VIEWS。
- 调用方向只允许 entry → parse/render、render → parse，禁止逆向依赖。

## File structure

```
mosaic/
├── src/                  # 三层源码（见上）
├── tests/                # node --test，只测 parse/render 的纯函数 .mjs
├── docs/
│   ├── _archive/         # 暂存区（默认空，.gitkeep 占位）
│   ├── _assets/          # 文档截图（模拟英文假数据，dark 主题实拍）
│   ├── design/           # 每个区块的设计文档（why 与机制，无代码）
│   ├── guides/           # 明细指导：各区块用法 / dataset 契约
│   ├── policies/         # 发版须遵守的 Obsidian 官方规范原文归档（带 source url）
│   ├── plans/            # 实施计划，随仓库分发
│   ├── research/         # 调研档案（当前为空，.gitkeep 占位）
│   └── *.md              # 介绍类：mosaic-intro（en 为准）与 zh 镜像
├── styles.css            # 插件样式（发布三件套之一）
├── manifest.json         # 插件清单（发布三件套之一）
├── esbuild.config.mjs    # 构建：tsc typecheck + esbuild bundle → main.js
└── NOTICE                # 早期内部实现 移植件的 Apache-2.0 署名
```

- `main.js` 是构建产物，不进 git；分发走 GitHub Releases 三件套（main.js/manifest.json/styles.css）。

## 开发命令

```bash
npm test               # node --test，全绿是任何提交的前提
npm run build          # tsc（noEmit typecheck）+ esbuild production
npm run install:vault  # build + 拷三件套到测试 vault
```

## 测试 vault（真机验证）

- 位置 `测试 vault`（仓库外独立目录，不进 git；不要用其他生产 vault 做测试）。
- 测试文档在其 `charts/` 与 `blocks/`；晨检清单 `verify.md`；README/文档截图的英文 demo 页与假数据集也在这里。
- obsidian CLI（obsidian-cli 桥）：`obsidian vault=mosaic-test-vault eval code='...'`；restricted mode 用 `app.plugins.setEnable(true)` 解除。
- 插件增删一律 `disablePluginAndSave`/`enablePluginAndSave`（纯 disablePlugin 会被 Obsidian 内存态写回复活）。
- 截图管线：JXA CGWindowList 取 Obsidian 窗口 id → `screencapture -x -o -l <id>` → ffmpeg 裁剪；只截 Obsidian 窗口，内容必须是模拟英文假数据。

## 已固化的陷阱（改渲染链路前必读）

1. **渲染时机**：Obsidian 打开文件时会在 section 未挂载（宽 0）或 ~330px 测量容器中调用 post-processor。渲染必须等 `whenHostReady`（无超时版——超时会造成永久空段落）+ ChartFigure 宽度监听就地重建。`stale()` 必须并入入口的 `unloaded` 标志，否则 host-ready 轮询对 detached 节点泄漏。
2. **主题切换**：走 `mosaic:theme-change` 自定义事件就地换肤，绝不能改回 `rerender(true)`（与阅读视图虚拟化竞态会丢图）；插件禁用窗口期的空段落由 onload 的 `rerenderOpenPreviews()`（私有 API rebuildView 可选调用）兜底。
3. **虚拟化假象**：用 obsidian CLI 查 DOM 时，视口外 section 未物化——统计错误框/图表数前要把 scroller `scrollTop` 拉到底，否则会把「没渲染」误判成回归。
4. **成对标签的 CommonMark 边界**：开标签必须单行、标签体内不能有空行——这是宿主段落切分规则，不是插件 bug，文档已固化说明。

## 上架合规（marketplace）

- 官方规范原文归档在 [docs/guides/](docs/guides/)：Developer policies、Submission requirements、Plugin guidelines、self-critique checklist。改 UI/设置页/manifest 前先对照。
- 已达成并必须保持：无 console 噪音、无 innerHTML、无网络请求、无遥测、UI 文案英文 sentence case、设置页无标题、build 必过 typecheck、`main.js` 不进 git。
- `src/parse/blocks/` 的 早期内部实现 移植件改动需同步核对 NOTICE。

## Git 规则

- 遵守全局 Git Protocol（分支 → commit+push → PR → merge 后清理）；默认不在 main 上 commit。
- commit 前必须 `npm test` 全绿 + `npm run build` 通过。
