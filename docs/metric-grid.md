# MetricGrid

> MetricGrid 内容块的完整文档：一组指标卡片，自适应网格布局，卡片按状态着色边框。
> 只支持成对标签入口，只支持内联 payload——不支持 `dataset` 属性、不支持自闭合（body 为空时直接报错）、不支持 `chartview` 代码块写法。

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

- **开标签必须单行**：只有「完整的开标签独占一行」才会触发 Obsidian 的 HTML block 规则，把标签体连同围栏整体交给插件；开标签换行会被当作普通段落，标签不会被接管，按原文渲染。不支持开标签跨多行。
- **标签体内不能有空行**：开标签到闭标签之间一旦出现空行，Obsidian 会提前结束当前 HTML block，标签同样不会被接管。
- 属性值支持双引号、单引号或不加引号三种写法。
- 闭合标签必须独占一行、与开标签同名，大小写敏感：`</MetricGrid>`。

## 属性表

| 属性 | 说明 |
| --- | --- |
| `title` | 渲染为组件标题，无则不渲染 |

MetricGrid **没有其他属性**——不支持 `dataset`、不支持粒度/时间范围。若在标签上写 `dataset="..."`，会被当作外部数据集组件处理但因不在支持名单内而报错（见下）。

## Payload 契约

标签体走通用的行提取规则，依次尝试四条路径：

1. 标签体是一个唯一的围栏代码块（` ```json ` / ` ```tsv ` / ` ```csv ` 或缺省语言标签）：`json` 按 JSON 解析；`tsv` 按 Tab 分隔；**其余任何语言标签一律退化按逗号 CSV 解析**。
2. 无围栏、裸文本以 `[` 或 `{` 开头：整体当 JSON 解析。
3. 无围栏、裸文本含 `|` 字符：当 Markdown 表格解析。
4. 兜底：裸文本按逗号 CSV 解析。

每行经过字段别名归一化（取第一个非空值）：

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

**最小示例**（伪造数据）：

```text
<MetricGrid title="示例指标">
```csv
label,value,delta,note,status
月活,1.2万,+5%,同比增长,good
留存率,42%,-3%,需关注,watch
```
</MetricGrid>
```

### 报错示例

红色错误框（就地透出根因，前缀均为 `Mosaic: `）：

```text
标签体为空或没有可解析的 payload
→ Mosaic: MetricGrid requires CSV, JSON, or a Markdown table.

标签上出现 dataset 属性（MetricGrid 不支持外部数据集）
→ Mosaic: External datasets support Chart and DataTable.
```

按原文渲染（不接管、不是错误框）：

- 开标签跨多行（Obsidian 段落规则不支持，见上文写法说明）。
- 标签体内出现空行。
- 段落里混有标签以外的内容。
- 找不到独占一行的 `</MetricGrid>` 闭合标签。

## 渲染效果

> 示例截图一律使用明显的假数据。

<!-- TODO: screenshot pending -->

- 自适应网格布局（卡片数量越多列数越多，最小宽 150px）：![自适应网格布局](assets/metric-grid-layout.png)
- good / risk / watch / neutral 四色状态边框：![四色状态边框](assets/metric-grid-status.png)
- 明暗主题跟随：![明暗主题跟随](assets/metric-grid-theme.png)
- 错误框呈现：![错误框呈现](assets/metric-grid-error.png)

## 相关文档

- [timeline.md](timeline.md)——同样使用通用行提取规则，字段别名归一化思路一致
- [decision-box.md](decision-box.md)
- [mosaic-intro.md](mosaic-intro.md)——整体定位与 Roadmap
