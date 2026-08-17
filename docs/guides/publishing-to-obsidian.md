# 发布到 Obsidian 插件市场

> Mosaic 上架社区插件目录（Community plugins）的标准操作步骤。规范原文归档在 [../policies/](../policies/)，本文只讲怎么做。
> 官方流程 2026 年已改版：**不再向 `obsidianmd/obsidian-releases` 提 PR**，改为在 community.obsidian.md 用 Obsidian 账号提交。网上旧教程仍在讲 PR 流程，不要照做。

## 一次性准备（只做一次）

**账号**

- GitHub 账号。
- Obsidian 账号（与 GitHub 账号不同，需在 obsidian.md 单独注册）。

**仓库根目录必须存在的三份文件**

| 文件 | 用途 |
| --- | --- |
| `README.md` | 目录列表页会摘录它；相对链接与图片路径会被自动改写为指向仓库 |
| `LICENSE` | 必须明确许可证；Mosaic 用 MIT |
| `manifest.json` | 插件清单，目录读的是**默认分支 HEAD 上的这一份** |

**manifest.json 的硬性约束**

- `id` 全局唯一，且**不能包含 `obsidian` 字样**。Mosaic 的 `id` 是 `mosaic`。
- `version` 必须是 `x.y.z` 三段式，不接受其他形态。
- `minAppVersion` 填**实际验证过**的最低 Obsidian 版本。
- 不接受捐赠就不要写 `fundingUrl`。

## 每次发版的四步

### 第 1 步 · 本地验收

```bash
npm test        # 必须全绿
npm run build   # tsc typecheck + esbuild production，必须通过
```

确认 `manifest.json` 的 `version` 已按 [Semantic Versioning](https://semver.org/) 递增，并已 commit 进默认分支。

### 第 2 步 · 打 tag

**tag 名必须与 `manifest.json` 的 `version` 一字不差，且不带 `v` 前缀。**

```bash
git tag -a 1.0.0 -m "1.0.0"
git push origin 1.0.0
```

- `-a` 建 annotated tag。
- `-m` 的内容对 Obsidian 而言就是版本号，必须与 version 相同。

### 第 3 步 · 出 Release

`.github/workflows/release.yml` 监听 tag push，自动 build 并创建 **draft release**，把三件套作为二进制附件上传：

- `main.js`
- `manifest.json`
- `styles.css`

工作流跑完后到仓库 **Releases** 页面，编辑那份草稿，补上 release notes，点 **Publish release**。

> **为什么必须是附件而不是 source zip**：用户安装插件时，Obsidian 从「tag 与 manifest 里 `version` 匹配」的那个 release 直接下载这三个文件。source zip 里没有 `main.js`（它不进 git），装不上。

工作流失败时的手工兜底：本地 `npm run build`，在 GitHub 网页手工建 release，tag 填版本号，把三个文件拖进附件区。

### 第 4 步 · 提交到社区目录（只有首次发版需要）

1. 打开 [community.obsidian.md](https://community.obsidian.md)，用 Obsidian 账号登录。
2. 关联 GitHub 账号——目录据此验证仓库归属。
3. Add a plugin，填仓库地址提交。

提交后进入**自动审核**，目录页会直接列出需要修正的项。修正方式是：改仓库 → **递增版本号** → 发一个新的 GitHub release。审核有错误未清时，插件在 Obsidian 内装不了。

审核通过后可以到论坛 [Share & showcase](https://forum.obsidian.md/c/share-showcase/9) 与 Discord `#updates` 频道公告。

## 常见卡点

| 症状 | 原因 |
| --- | --- |
| 目录读到的信息不对 | 目录读的是默认分支 HEAD 的 `manifest.json`，不是 release 附件里那份——两处必须同步 |
| 用户装不上 | release 的 tag 与 manifest 的 `version` 不一致，或三件套没作为附件上传 |
| 提交被拒：id 含 obsidian | `id` 不允许出现 `obsidian` 字样 |
| 审核反复不过 | 每次修正都要发**新版本**的 release，改完不发版等于没改 |

## 相关文档

- [../policies/](../policies/)——四篇官方规范原文归档（开发者政策、提交要求、插件指南、自查清单），改 UI / 设置页 / manifest 前先对照
- [../../AGENTS.md](../../AGENTS.md)——上架合规中已达成且必须保持的红线
