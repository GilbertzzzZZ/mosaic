# 成对标签

> 第三种声明语法：属性写在开标签上，数据 payload 写在标签体内。
> `<Chart>` 内联 CSV 已可用；MetricGrid / DataTable / Card 仍计划中。

## 定位

- 面向小数据量、一次性的内容块：数据直接内联在正文里，不依赖外部文件。
- 与自闭合标签互补：自闭合 + dataset 服务长期序列；成对标签服务快照型内容。

## 基本写法（`<Chart>` 内联 CSV）

属性写在开标签，CSV 数据用围栏块内嵌于标签体，语言标注 `csv` 可省略：

````text
<Chart title="示例" type="line" x="month" series="指标A,指标B" unit="件">
```csv
month,指标A,指标B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
</Chart>
````

属性契约与 [[docs/chart-tag|自闭合标签]]、[[docs/code-block|代码块]] 完全一致，此处不重复；内联模式的边界见下。

## 内联模式的边界

- 不支持 `dataset` / `from` / `to` / `granularity` / `granularityOptions`——这些属于外部数据集语义。
- `x` 缺省取 CSV 首列；声明的列必须存在于表头。
- 数值列必须是数字或留空，留空表示断点；不合法时报错并给出行号。
- 标签体内不能有空行；开标签到闭标签之间必须是「可选空白 + CSV 围栏 + 可选空白」。
- fence 语言标注 `csv` 可省略，但围栏本身必须存在——裸文本 CSV 不带围栏不会被识别。
- 整段（该 `<Chart>...</Chart>` 所在段落）只能有标签与空白，混排内容不接管。
- 无溯源脚注、无粒度切换按钮；数值格式化、单位前缀/后缀、Y 轴留白、图例样式、主题跟随与 dataset 模式一致。
- 同时提供 `dataset` 与内联 CSV、或两者都不提供，均报错拒绝渲染。

## 规划的内容块类型

| 类型 | 说明 | 状态 |
| --- | --- | --- |
| `Chart`（内联数据） | 标签体内嵌 CSV 出图 | 已可用 |
| `MetricGrid` | 指标网格，每格 label / value / delta / note | 计划中 |
| `DataTable` | 数据表格，支持外部数据集 | 计划中 |
| `Card` | 卡片式内容块 | 计划中 |

## 渲染效果

- ![待补充]（各类型效果图，待实现后以假数据补图）

## 设计约束

- 沿用三段式管线：识别（源文本命中成对标签）→ 解析（payload 解析归一为渲染配置）→ 渲染（按类型分发到对应组件）。
- 接管规则与自闭合标签一致：只接管纯标签段落；错误就地呈现。
- 未实现类型（MetricGrid、DataTable、Card）沿用同一识别层，按类型分发到各自解析与渲染组件。

## 相关文档

- [[docs/chart-tag|chart-tag.md]]——自闭合标签，外部数据集模式
- [[docs/code-block|code-block.md]]——代码块入口，frontmatter 属性契约与另一种内联 CSV 写法
- [[docs/dataset-guide|dataset-guide.md]]——三入口共用的属性契约、manifest 规则
- [[docs/mosaic-intro|mosaic-intro.md]]——整体定位与 Roadmap
