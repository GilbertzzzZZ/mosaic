# Mosaic

> Mosaic is a declarative content-block rendering plugin for Obsidian: declare blocks in md / mdx with a simple convention, and the plugin recognizes, parses, and renders them as rich interactive content.
> Like a mosaic, your note is assembled from individual blocks — charts, metric grids, cards — that compose into a complete picture.

## Positioning

> An upgrade from "a chart plugin" to "a general content-block rendering engine" — chart is just the first block type.

**One-line pitch**

- Write plain-text declarations in your notes, get rich interactive content — no changes to your source files, no external site required.

---

## How It Works

> A three-stage pipeline: multi-entry recognition → per-entry parsing → type-specific rendering.

**Recognize**

- Scan md / mdx content for block declarations matching the syntax conventions.
- Each syntax is an independent entry point; entries never interfere with each other.

**Parse**

- Dispatch each block to its type-specific parsing chain: read declared attributes, load data, build the render config.
- A failed parse renders an inline error box and never breaks the rest of the document.

**Render**

- Each block type has its own render component; chart blocks are powered by Ant Design Charts (AntV).
- Rendering targets the reading view; Live Preview support is on the roadmap.

---

## Declaration Syntax

> Three ways to declare a block, all written directly in md / mdx content.

**Code block** (`---` frontmatter, optional inline CSV below)

````text
```chartview
---
title: "Example Trend"
type: line
series: "Metric A,Metric B"
unit: "units"
---
month,Metric A,Metric B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
````

Full reference: [[docs/chart|chart.md]].

**Self-closing tag** (one attribute per line)

```text
<Chart
  title="Monthly Active Paid Rate"
  dataset="data/metrics/monthly-active-paid-rate.dataset.json"
  type="line"
  x="period"
  series="paid rate,piano,violin"
  unit="%"
  labels="all"
  from="2024-07-01"
  to="2026-07-01"
  granularity="month"
  granularityOptions="month,quarter"
  note="Paid rate = paying users / active users; quarterly view is the arithmetic mean of monthly rates."
/>
```

**Paired tag** (attributes on the opening tag, data payload in the body — shared by `Chart` and the five tag-only block types)

````text
<MetricGrid title="Product Overview">
```csv
label,value,delta,note,status
Total users,1.98M,,students 1.62M,neutral
New users / mo,20K,,piano 251/day; violin 350/day,neutral
MAU,132K,,avg WAU 67K; DAU 25K,neutral
Active paid rate,2.6%,,piano 1.1%; violin 3.1%,neutral
```
</MetricGrid>
````

---

## Block Types

> All six types from the git-leaf superset are available: Chart, DataTable, MetricGrid, Timeline, DecisionBox, FlowDiagram.

**Chart**

- Line, bar, grouped-bar, stacked-bar, combo and combo-dual-axis, driven by one declarative attribute contract shared across all three entries.
- Data comes from an external dataset manifest, or inline CSV written directly in the declaration.
- Full attribute contract: [[docs/dataset-guide|dataset-guide.md]].

**DataTable, MetricGrid, Timeline, DecisionBox, FlowDiagram** (git-leaf superset, tag entries only)

- Tag entries only (paired tag; `DataTable` also supports a self-closing form for its `dataset` mode) — no `chartview` code block for these five.
- `DataTable` reads inline tables (CSV/JSON/Markdown) or an external dataset manifest, sharing the same query layer as Chart.
- `MetricGrid`, `Timeline`, `DecisionBox`, `FlowDiagram` take inline payloads only; each has its own field-alias and status-vocabulary contract.
- `DecisionBox` is the one type that never renders an error box — an empty or unstructured body falls back to a short rich-text render.
- Full contracts: [[docs/data-table|data-table.md]], [[docs/metric-grid|metric-grid.md]], [[docs/timeline|timeline.md]], [[docs/decision-box|decision-box.md]], [[docs/flow-diagram|flow-diagram.md]].

**More types** (planned)

- The git-leaf set is the floor, not the ceiling: additional Mosaic-original block types will extend through the same pipeline.

---

## Data Sources

> Block data can be written inline as CSV, or loaded from an external dataset manifest.

**Inline CSV**

- Data is written directly in the declaration: a fenced CSV block in a paired tag body, or a CSV section below the `---` frontmatter in a code block.
- Ideal for small, one-off charts — no external file needed.

**External datasets (dataset manifest)**

- Place a `.dataset.json` sidecar manifest next to the data file to declare metric semantics and roll-up rules.
- The tag declares the time range and display granularity; the plugin applies range filtering and granularity roll-up per the manifest.
- Metric semantics (label, note, provenance footnote) stay visible alongside the chart.
- Design details: [[docs/dataset-guide|dataset-guide.md]].

---

## Companion Features

> Tools and interactions that lower the cost of writing blocks.

**Safety boundaries**

- No SQL, no formula evaluation, no script execution.
- No file access outside the vault, no network requests.

---

## Roadmap

> Planned but not yet implemented; all items are placeholders unless marked done.

- (Placeholder) Live Preview rendering.
- (Done 2026-08-15) DataTable, MetricGrid, Timeline, DecisionBox and FlowDiagram block types — completing the git-leaf superset.
- (Done 2026-08-14) Plugin id migrated to `mosaic`. Marketplace listing plan remains a placeholder.

---

## Installation

> Manual install is available; marketplace listing is pending.

**Manual install**

- Copy the build artifacts (`main.js`, `manifest.json`, `styles.css`) into the vault's `.obsidian/plugins/mosaic/` directory and enable the plugin.

**Community marketplace**

- (Placeholder: listing plan and install entry.)
