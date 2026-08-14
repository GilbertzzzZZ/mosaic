# MetricGrid 测试页

> 全部为一眼假数据。对应文档：[[docs/metric-grid|metric-grid.md]]。

## 1 正常形态：good / risk / watch / neutral 全触达

<MetricGrid title="示例指标全景">
```csv
label,value,delta,note,status
月活,1.2万,+5%,同比增长,good
留存率,42%,-3%,需关注,risk
客单价,88元,持平,环比无变化,watch
新客占比,18%,,暂无口径,neutral
```
</MetricGrid>

## 2 status 缺省，靠 delta 正负号自动判定颜色

<MetricGrid title="delta 自动判定">
```csv
label,value,delta
留存天数,7天,+1天
流失率,4.2%,-0.8%
```
</MetricGrid>

## 3 错误路径 A：空 payload（应显示红色错误框）

<MetricGrid title="空数据">
```csv
```
</MetricGrid>

## 4 错误路径 B：标签上出现 dataset 属性（应显示红色错误框，MetricGrid 不支持外部数据集）

<MetricGrid title="误用 dataset" dataset="demo.dataset.json">
```csv
label,value
月活,1.2万
```
</MetricGrid>

## 5 原文回落：开标签跨多行（应渲染为原文，不接管）

<MetricGrid
  title="跨行开标签"
>
```csv
label,value
月活,1.2万
```
</MetricGrid>
