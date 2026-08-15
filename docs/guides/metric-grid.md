# MetricGrid

> MetricGrid 内容块的使用指导（how）：一组指标卡片，自适应网格布局，卡片按状态着色边框。
> 只支持成对标签入口，只支持内联 payload——不支持 `dataset` 属性、不支持自闭合（body 为空时直接报错）、不支持 `chartview` 代码块写法。
> 标签写法通则见 [tag-syntax.md](tag-syntax.md)；网格自适应与状态色的设计动机见 [design/metric-grid.md](../design/metric-grid.md)。

## 写法

属性写在开标签上，payload 写在标签体内：

````text
<MetricGrid title="示例指标">
```csv
label,value,delta,note,status
月活,1.2万,+5%,同比增长,good
留存率,42%,-3%,需关注,watch
客单价,88元,+1%,环比持平,neutral
```
</MetricGrid>
````

写法边界（开标签必须单行、标签体内不能有空行、属性引号形态与 `=` 规则、闭合标签独占一行且大小写敏感）见 [tag-syntax.md](tag-syntax.md)。

## 属性表

| 属性 | 说明 |
| --- | --- |
| `title` | 渲染为组件标题，无则不渲染 |

MetricGrid **没有其他属性**——不支持 `dataset`、不支持粒度/时间范围。若在标签上写 `dataset="..."`，会被当作外部数据集组件处理但因不在支持名单内而报错（见下）。

## Payload 契约

标签体走[通用行提取四路径](tag-syntax.md#通用行提取四路径)，提取出的每行经过字段别名归一化（取第一个非空值）：

| 输出字段 | 别名优先级 |
| --- | --- |
| `label` | `label` ?? `metric` ?? `name` ?? `title` |
| `value` | `value` ?? `current` ?? `amount` ?? `count` |
| `delta` | `delta` ?? `change` ?? `mom` ?? `yoy` |
| `note` | `note` ?? `description` ?? `source` ?? `body` |
| `status` | 见下表，输入取 `status` ?? `trend` ?? `delta` ?? `change` |

`label` 与 `value` 都为空的行会被丢弃，不计入渲染。

**status 状态词表**（状态词自动归一化为四个桶，支持的词表见下）：

| 归一化结果 | 命中输入 |
| --- | --- |
| `good` | `good` / `up` / `positive` / `success` / `active`，或取值以 `+` 开头 |
| `risk` | `risk` / `warning` / `blocked` / `down` / `negative`，或取值以 `-` 开头 |
| `watch` | `watch` / `flat` / `neutral` |
| `neutral`（默认） | 其他任意值或未指定 |

即：以 `+`/`-` 开头的 `delta` 列（如 `"+5%"`）不显式声明 `status` 也能自动判定颜色。

**空数据报错**：解析不出任何数据行时触发；若行存在、但 label/value 均为空而被全部过滤，则不报错，只渲染一个空的网格容器。

### 报错示例

红色错误框（就地透出根因，前缀均为 `Mosaic: `）：

```text
标签体为空或没有可解析的 payload
→ Mosaic: MetricGrid requires CSV, JSON, or a Markdown table.

标签上出现 dataset 属性（MetricGrid 不支持外部数据集）
→ Mosaic: External datasets support Chart and DataTable.
```

按原文渲染（不接管、不是错误框）的情形对全部标签组件一致，见 [tag-syntax.md](tag-syntax.md#按原文渲染的通用情形)。

## 渲染效果

> 示例截图一律使用模拟假数据（dark 主题实拍）。

自适应网格 + good / risk / watch / neutral 四色状态顶边：

![MetricGrid status cards](../_assets/metric-grid.png)

## 相关文档

- [tag-syntax.md](tag-syntax.md)——标签写法通则与通用行提取规则
- [timeline.md](timeline.md)——字段别名归一化思路一致的姊妹组件
- [design/metric-grid.md](../design/metric-grid.md)——网格自适应、状态色与别名链的设计动机
- [mosaic-intro.md](../mosaic-intro.md)——整体定位与 Roadmap
