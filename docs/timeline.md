# Timeline

> Timeline 内容块的完整文档：纵向时间线列表，每个节点按状态着色圆点。
> 只支持成对标签入口，只支持内联 payload——不支持 `dataset` 属性、不支持自闭合（body 为空时直接报错）、不支持 `chartview` 代码块写法。

## 写法

属性写在开标签上，payload 写在标签体内：

````text
<Timeline title="示例进展">
```json
[
  {"date":"2026-01-01","title":"启动","body":"完成立项","status":"done"},
  {"date":"2026-01-08","title":"评审","body":"存在风险点","status":"blocked"},
  {"date":"2026-01-15","title":"开发中","body":"接口联调","status":"active"},
  {"date":"2026-01-22","title":"待排期","body":"下一步计划","status":"other"}
]
```
</Timeline>
````

- **开标签必须单行**：只有「完整的开标签独占一行」才会触发 Obsidian 的 HTML block 规则，把标签体连同围栏整体交给插件；开标签换行会被当作普通段落，标签不会被接管，按原文渲染。git-leaf 原实现允许开标签跨多行，Mosaic 不支持这一点。
- **标签体内不能有空行**：开标签到闭标签之间一旦出现空行，Obsidian 会提前结束当前 HTML block，标签同样不会被接管。git-leaf 没有这个限制。
- 属性值支持双引号、单引号或不加引号三种写法。
- 闭合标签必须独占一行、与开标签同名，大小写敏感：`</Timeline>`。

## 属性表

| 属性 | 说明 |
| --- | --- |
| `title` | 渲染为组件标题，无则不渲染 |

Timeline **没有其他属性**——不支持 `dataset`。若在标签上写 `dataset="..."`，会被当作外部数据集组件处理但因不在支持名单内而报错（见下）。

## Payload 契约

标签体走通用的行提取规则，依次尝试四条路径：

1. 标签体是一个唯一的围栏代码块（` ```json ` / ` ```tsv ` / ` ```csv ` 或缺省语言标签）：`json` 按 JSON 解析；`tsv` 按 Tab 分隔；**其余任何语言标签一律退化按逗号 CSV 解析**。
2. 无围栏、裸文本以 `[` 或 `{` 开头：整体当 JSON 解析。
3. 无围栏、裸文本含 `|` 字符：当 Markdown 表格解析。
4. 兜底：裸文本按逗号 CSV 解析。

每行经过字段别名归一化（取第一个非空值）：

| 输出字段 | 别名优先级 |
| --- | --- |
| `date` | `date` ?? `time` ?? `month` |
| `title` | `title` ?? `name` ?? `event` |
| `body` | `body` ?? `description` ?? `summary` ?? `note` |
| `owner` | `owner` ?? `assignee` |
| `status` | 见下表 |

**没有必填字段校验**——即使一行的 `date`/`title`/`body`/`owner` 全为空，也只是渲染出一个空壳节点（各字段只在非空时才渲染对应子元素）。

**status 状态词表**（`normalizeStatus`，四个桶，默认 `default`）：

| 归一化结果 | 命中输入 |
| --- | --- |
| `done` | `done` / `complete` / `completed` / `success` |
| `blocked` | `blocked` / `risk` / `warning` |
| `active` | `active` / `doing` / `progress` / `in-progress` |
| `default`（默认） | 其他任意值或未指定 |

注意：`risk`/`warning` 归入 `blocked` 桶，不是单独的状态——这与 MetricGrid 的 `risk` 桶命名相似但语义不同，容易混淆。

**空数据报错**：`rows.length === 0` 时触发。

**最小示例**（伪造数据）：

```text
<Timeline title="示例进展">
```json
[
  {"date":"2026-01-01","title":"启动","body":"完成立项","status":"done"},
  {"date":"2026-01-08","title":"评审","body":"存在风险点","status":"blocked"}
]
```
</Timeline>
```

### 报错示例

红色错误框（就地透出根因，前缀均为 `Mosaic: `）：

```text
标签体为空或没有可解析的行
→ Mosaic: Timeline requires CSV or JSON rows.

标签上出现 dataset 属性（Timeline 不支持外部数据集）
→ Mosaic: External datasets support Chart and DataTable.
```

注意：错误文案只提「CSV or JSON」，但裸 Markdown 表格路径实际上也被接受（继承自通用的行提取规则）——这是文案与实际能力的一处偏差，Mosaic 与 git-leaf 保持一致，未做修正。

按原文渲染（不接管、不是错误框）：

- 开标签跨多行（Obsidian 段落规则不支持，见上文写法说明）。
- 标签体内出现空行。
- 段落里混有标签以外的内容。
- 找不到独占一行的 `</Timeline>` 闭合标签。

## 渲染效果

> 图片均为待补充占位；示例截图一律使用明显的假数据。

- 纵向时间线，竖线连接、末项截断：![待补充]
- done / active / blocked / default 四色状态圆点（`active` 跟随 Obsidian 主题强调色）：![待补充]
- 明暗主题跟随：![待补充]
- 错误框呈现：![待补充]

## 相关文档

- [[docs/metric-grid|metric-grid.md]]——同样使用 `extractRows` 通用行提取，字段别名归一化思路一致
- [[docs/decision-box|decision-box.md]]
- [[docs/mosaic-intro|mosaic-intro.md]]——整体定位与 Roadmap
