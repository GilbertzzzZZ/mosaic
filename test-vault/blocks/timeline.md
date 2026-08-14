# Timeline 测试页

> 全部为一眼假数据。对应文档：[[docs/timeline|timeline.md]]。

## 1 正常形态：done / blocked / active / default 全触达

<Timeline title="示例进展全景">
```json
[
  {"date":"2026-01-01","title":"启动","body":"完成立项","owner":"alice","status":"done"},
  {"date":"2026-01-08","title":"评审","body":"存在风险点","owner":"bob","status":"blocked"},
  {"date":"2026-01-15","title":"开发中","body":"接口联调","owner":"carol","status":"active"},
  {"date":"2026-01-22","title":"待排期","body":"下一步计划","owner":"dave","status":"unknown"}
]
```
</Timeline>

## 2 别名字段（time/month 代替 date，event 代替 title，assignee 代替 owner）

<Timeline title="别名字段演示">
```csv
month,event,summary,assignee,status
2026-02,里程碑评审,阶段验收,alice,success
2026-03,风险复盘,存在阻塞项,bob,warning
```
</Timeline>

## 3 错误路径 A：空 payload（应显示红色错误框）

<Timeline title="空数据">
```json
[]
```
</Timeline>

## 4 错误路径 B：标签上出现 dataset 属性（应显示红色错误框，Timeline 不支持外部数据集）

<Timeline title="误用 dataset" dataset="demo.dataset.json">
```json
[{"date":"2026-01-01","title":"启动"}]
```
</Timeline>

## 5 原文回落：开标签跨多行（应渲染为原文，不接管）

<Timeline
  title="跨行开标签"
>
```json
[{"date":"2026-01-01","title":"启动"}]
```
</Timeline>
