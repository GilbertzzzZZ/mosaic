# 成对标签（计划中）

> 第三种声明语法：属性写在开标签上，数据 payload 写在标签体内。**整体处于计划中，插件当前不渲染此形态**，本文先立框架。

## 定位

- 面向小数据量、一次性的内容块：数据直接内联在正文里，不依赖外部文件。
- 与自闭合标签互补：自闭合 + dataset 服务长期序列；成对标签服务快照型内容。

## 预期语法

属性在开标签，payload 用围栏块内嵌于标签体：

````text
<MetricGrid title="产品概览">
```csv
label,value,delta,note,status
指标A,1.98M,,备注文本,neutral
指标B,20K,,备注文本,neutral
```
</MetricGrid>
````

同一形态也将支持 `<Chart>` 内联数据：

````text
<Chart title="示例" type="line" x="month" series="a,b" unit="件">
```csv
month,a,b
2025-01,120,80
2025-02,140,90
```
</Chart>
````

## 规划的内容块类型

| 类型 | 说明 | 状态 |
| --- | --- | --- |
| `Chart`（内联数据） | 标签体内嵌 CSV / JSON 出图 | 计划中 |
| `MetricGrid` | 指标网格，每格 label / value / delta / note | 计划中 |
| `DataTable` | 数据表格，支持外部数据集 | 计划中 |
| `Card` | 卡片式内容块 | 计划中 |

## 渲染效果

- ![待补充]（各类型效果图，待实现后以假数据补图）

## 设计约束

- 沿用三段式管线：识别（源文本命中成对标签）→ 解析（payload 解析归一为渲染配置）→ 渲染（按类型分发到对应组件）。
- 接管规则与自闭合标签一致：只接管纯标签段落；错误就地呈现。
- payload 围栏与外层 markdown 的嵌套解析是识别层的主要新工作。

## 相关文档

- [[docs/chart-tag|chart-tag.md]]——自闭合标签（当前可用）
- [[docs/mosaic-intro|mosaic-intro.md]]——整体定位与 Roadmap
