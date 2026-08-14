# 晨检清单（test-vault）

> 打开本 vault（Obsidian 侧边栏切到 test-vault），逐页目检。自动化 DOM 断言已于夜间全部通过，本清单供人工复核视觉细节。

## charts/统一入口验证.md（Chart 回归）

- §1 代码块与 §2 自闭合标签渲染完全一致：折线图、month/quarter 按钮、底部脚注
- §3 代码块内联：分组柱状图，无脚注、无粒度按钮
- §4 成对标签：combo 图（柱=指标A、线=指标B）
- §5 / §6：两个红色错误框
- §7：显示原文内容（month,指标A 等文字可见，非错误框）
- 数值标签带明暗主题 halo 描边；切换主题即时换肤

## blocks/ 五页（新内容块类型）

**metric-grid.md**：3 个指标网格（状态色顶边：绿/红/橙/无）；1 个错误框（dataset 误用）；末尾跨行开标签按原文显示

**timeline.md**：2 条时间线共 6 节点（圆点色：绿=done、主题色=active、橙=blocked、灰=default，竖线末项截断）；2 个错误框

**decision-box.md**：6 个决策盒（徽章、label/value 两列、富文本回退各形态）；2 个错误框（dataset 误用 + 畸形 JSON）

**flow-diagram.md**：2 张 SVG 流程图共 7 节点（类型配色、贝塞尔连线、箭头、环退化例）；2 个错误框

**data-table.md**：4 张表——内联 CSV/JSON/Markdown 表 + dataset 模式；dataset 表：表头显示 manifest label（营收（万元）/订单量）、month/quarter 按钮切换（6 行↔2 行、首格 2025-Q1）、底部溯源脚注；1 个错误框（query fence 外的内联 payload）

## 判定标准

- 任何页面出现空白段落、未预期错误框、或组件位置显示原始标签文字（§7 与各页回落例除外）即为异常
- 异常时先完全重启 Obsidian 再复现（进程级管线卡死的既知陷阱），仍异常再报修
