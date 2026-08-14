# 代码块（chartview）

> `chartview` 代码块入口：`---` frontmatter 属性区 + 可选内联 CSV。
> 属性契约与 [[docs/chart-tag|自闭合标签]] 一字不差，同一属性写成标签或代码块渲染结果完全一致。

## 基本写法

> 两种写法共用同一份 frontmatter 属性区，区别只在于是否携带 `---` 之后的内联 CSV 数据区。

### 引用外部数据集（只写 frontmatter）

- 只写 frontmatter，不带数据区，语义与自闭合标签的 `dataset` 模式完全一致。
- `dataset` 路径相对当前笔记所在目录解析，粒度按钮、溯源脚注等展示细节见 [[docs/dataset-guide|dataset-guide.md]]。

````text
```chartview
---
title: "示例趋势"
dataset: "data/schema/example.dataset.json"
type: combo
x: period
lines: 总量
bars: "指标A,指标B"
unit: 件
granularityOptions: "month,quarter"
---
```
````

### 内联 CSV（frontmatter + 数据区）

- frontmatter 去掉 `dataset`，`---` 结束后紧跟 CSV 表头与数据行即为内联模式。
- `x` 缺省取 CSV 首列，此例显式省略也可正常渲染。

````text
```chartview
---
title: "示例趋势"
type: line
series: "指标A,指标B"
unit: 件
---
month,指标A,指标B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
````

---

## 属性

> frontmatter 的属性契约与自闭合标签一字不差，此处不重复列举。

- 完整属性表见 [[docs/dataset-guide|dataset-guide.md]]，同一属性写成标签或代码块渲染结果完全一致。
- frontmatter 为扁平 `key: value`，一行一个；值可用引号包裹；`#` 开头的行是注释。
- 不支持嵌套结构——这是声明式契约，不是 AntV 配置透传。

---

## 内联模式的边界

> `dataset` 与内联 CSV 数据区二选一；两者都给或都不给会报错。

- 不支持 `dataset` / `from` / `to` / `granularity` / `granularityOptions`——这些属于外部数据集语义。
- `x` 缺省取 CSV 首列；显式声明的列必须存在于 CSV 表头。
- 数值列必须是数字或留空，留空表示断点；不合法时报错并给出行号。
- 无溯源脚注、无粒度切换按钮；数值格式化、单位前缀/后缀、Y 轴留白、图例样式、主题跟随与 dataset 模式一致。
- 同时提供 `dataset` 与内联 CSV 数据区、或两者都不提供，均报错拒绝渲染。

---

## 渲染效果

> 效果与 [[docs/chart-tag|自闭合标签]] 完全一致，此处仅补图。

- ![待补充]

---

## 相关文档

- [[docs/chart-tag|chart-tag.md]]——自闭合标签，dataset 模式的完整写法与展示语义
- [[docs/paired-tag|paired-tag.md]]——成对标签形态，`<Chart>` 内联 CSV 已可用
- [[docs/dataset-guide|dataset-guide.md]]——manifest 契约、属性表、查询语义、排错清单
