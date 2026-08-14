# DataTable 测试页

> 全部为一眼假数据。对应文档：[[docs/data-table|data-table.md]]。

## 1 内联 CSV

<DataTable title="内联 CSV · 示例明细" columns="item,amount,note">
```csv
item,amount,note
sample-a,10,ok
sample-b,5,watch
sample-c,8,ok
```
</DataTable>

## 2 内联 JSON

<DataTable title="内联 JSON · 示例明细">
```json
[
  {"item":"sample-x","amount":12,"note":"ok"},
  {"item":"sample-y","amount":3,"note":"watch"}
]
```
</DataTable>

## 3 内联 Markdown 表格（裸文本，无围栏）

<DataTable title="内联 Markdown 表格 · 示例明细">
| item | amount | note |
| --- | --- | --- |
| sample-m | 7 | ok |
| sample-n | 9 | watch |
</DataTable>

## 4 Dataset 模式（自闭合，粒度按钮组 + 溯源脚注）

<DataTable
  dataset="demo.dataset.json"
  columns="AnchorDate,营收,订单量"
  granularity="month"
  granularityOptions="month,quarter"
/>

## 5 Dataset 模式 + query fence 过滤（按门店过滤）

<DataTable dataset="demo.dataset.json" columns="AnchorDate,营收,订单量" from="2025-01-01" to="2025-03-01">
```query
{"where":[{"field":"门店","op":"eq","value":"示例门店A"}]}
```
</DataTable>

## 6 columnLabels 陷阱演示（标签属性不生效）

下面这个表格故意在标签上写了 `columnLabels`，表头依然显示原始列名 `营收`，不会变成「收入」——`columnLabels` 只能来自 dataset manifest 的 `fields[].label`（见第 4、5 节表头「营收（万元）」「订单量」），不能写在标签属性里。

<DataTable title="columnLabels 无效演示" columns="item,营收" columnLabels="{&quot;营收&quot;:&quot;收入&quot;}">
```csv
item,营收
sample-a,10
sample-b,5
```
</DataTable>

## 7 错误路径 A：空 payload（应显示红色错误框）

<DataTable title="空数据">
```csv
```
</DataTable>

## 8 错误路径 B：dataset 模式塞入内联 CSV（应显示红色错误框，互斥冲突）

<DataTable dataset="demo.dataset.json" columns="AnchorDate,营收">
```csv
item,amount
sample-a,10
```
</DataTable>

## 9 原文回落：开标签跨多行（应渲染为原文，不接管）

<DataTable
  title="跨行开标签"
  columns="item,amount"
>
```csv
item,amount
sample-a,10
```
</DataTable>
