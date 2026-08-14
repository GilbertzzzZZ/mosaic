# DecisionBox 测试页

> 全部为一眼假数据。对应文档：[[docs/decision-box|decision-box.md]]。

## 1 正常形态：结构化 label/value

<DecisionBox title="示例决策" status="accepted" owner="alice" source="RFC-001">
```csv
label,value
决策,采用方案 A
代价,迁移成本约两周
```
</DecisionBox>

## 2 status 全枚举：accepted / proposed / rejected / superseded

<DecisionBox title="状态 accepted" status="accepted">
```csv
label,value
决策,示例决策 1
```
</DecisionBox>

<DecisionBox title="状态 proposed" status="proposed">
```csv
label,value
决策,示例决策 2
```
</DecisionBox>

<DecisionBox title="状态 rejected" status="rejected">
```csv
label,value
决策,示例决策 3
```
</DecisionBox>

<DecisionBox title="状态 superseded" status="superseded">
```csv
label,value
决策,示例决策 4
```
</DecisionBox>

## 3 status 别名与归一化：decisionStatus="done" → accepted

<DecisionBox title="别名归一化" decisionStatus="done">
```csv
label,value
决策,示例决策 5
```
</DecisionBox>

## 4 富文本回退（无结构化数据，单段落）

<DecisionBox title="富文本回退 · 段落">
我们选择方案 A，理由是实现简单、迁移成本可控。
</DecisionBox>

## 5 富文本回退（无结构化数据，无序列表）

<DecisionBox title="富文本回退 · 列表">
- 优点：实现简单
- 缺点：扩展性一般
</DecisionBox>

## 6 错误路径 A：标签上出现 dataset 属性（应显示红色错误框，DecisionBox 不支持外部数据集）

<DecisionBox title="误用 dataset" dataset="demo.dataset.json">
```csv
label,value
决策,示例决策
```
</DecisionBox>

## 7 错误路径 B：fenced json 内容不是合法 JSON（应显示红色错误框，原生 JSON 解析错误）

<DecisionBox title="畸形 JSON">
```json
{ label: "决策", value: }
```
</DecisionBox>

## 8 原文回落：开标签跨多行（应渲染为原文，不接管）

<DecisionBox
  title="跨行开标签"
>
```csv
label,value
决策,示例决策
```
</DecisionBox>
