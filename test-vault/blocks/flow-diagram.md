# FlowDiagram 测试页

> 全部为一眼假数据。对应文档：[[docs/flow-diagram|flow-diagram.md]]。

## 1 形态 A：graph JSON（start / decision / gate / risk / action / end 全触达）

<FlowDiagram title="形态 A · graph JSON" note="type 六种枚举全触达">
```json
{
  "nodes": [
    {"id": "a", "label": "开始", "type": "start"},
    {"id": "b", "label": "网关判断", "type": "gate"},
    {"id": "c", "label": "分支条件", "type": "decision"},
    {"id": "d", "label": "风险处理", "type": "risk"},
    {"id": "e", "label": "常规动作", "type": "action"},
    {"id": "f", "label": "结束", "type": "end"}
  ],
  "edges": [
    {"from": "a", "to": "b"},
    {"from": "b", "to": "c", "label": "满足"},
    {"from": "c", "to": "d", "label": "异常"},
    {"from": "c", "to": "e", "label": "正常"},
    {"from": "d", "to": "f"},
    {"from": "e", "to": "f"}
  ]
}
```
</FlowDiagram>

## 2 形态 B：表格式行（`next` 隐式生成边）

<FlowDiagram title="形态 B · 表格式行" note="next 列逗号分隔多个后继">
```csv
id,label,type,next
a,开始,start,"b,c"
b,审批路径,action,d
c,直连路径,action,d
d,结束,end,
```
</FlowDiagram>

## 3 环退化例（三节点环，应拉直为纵向链而非闭环）

<FlowDiagram title="环退化例" note="a→b→c→a，三节点环拉直为三层纵向链">
```csv
id,label,type,next
a,节点A,action,b
b,节点B,action,c
c,节点C,action,a
```
</FlowDiagram>

## 4 错误路径 A：空 payload（应显示红色错误框）

<FlowDiagram title="空数据">
```json
{"nodes":[]}
```
</FlowDiagram>

## 5 错误路径 B：标签上出现 dataset 属性（应显示红色错误框，FlowDiagram 不支持外部数据集）

<FlowDiagram title="误用 dataset" dataset="demo.dataset.json">
```json
{"nodes":[{"id":"a","label":"开始"}]}
```
</FlowDiagram>

## 6 原文回落：开标签跨多行（应渲染为原文，不接管）

<FlowDiagram
  title="跨行开标签"
>
```json
{"nodes":[{"id":"a","label":"开始"}]}
```
</FlowDiagram>
