# Chart

<p align="center"><b>English</b> | <a href="chart-zh.md">简体中文</a></p>

> How to use the Chart block: one chart, three ways to write it — a self-closing tag, a paired tag, and a code block.
> All three share the same attribute contract (see [Attributes](#attributes) below); a given attribute renders identically no matter which form it is written in.
> Shared tag rules are in [tag-syntax.md](tag-syntax.md); the rationale behind three forms and the type system is in [design/chart.md](../design/chart.md); the external-dataset contract is in [dataset-guide.md](dataset-guide.md).

## The three forms at a glance

| Form | Shape | Data source | Best for |
| --- | --- | --- | --- |
| Self-closing tag | `<Chart ... />` | External dataset (`.dataset.json`) | Long-lived reports where the data stays in an external file |
| Paired tag | `<Chart ...>` + CSV fence + `</Chart>` | Inline CSV | Small, one-off snapshots |
| Code block | ```` ```chart ```` + `---` frontmatter | Either external dataset or inline CSV | Both modes; the only option when you need non-ASCII attribute names |

**Rules common to all three**

- The attribute contract and display semantics are in [Attributes](#attributes) and [Chart types and display semantics](#chart-types-and-display-semantics) below, and are identical across the three forms.
- Host paragraph rules and attribute syntax for the tag forms (no spaces around `=`, quoting forms, mixed paragraphs not taken over) are in [tag-syntax.md](tag-syntax.md).
- Reading view only; Live Preview is planned.

**Inline mode** (the boundary shared by the paired tag and the code block's CSV)

- No `dataset` / `from` / `to` / `granularity` / `granularityOptions` — those belong to external-dataset semantics.
- `x` defaults to the first CSV column; any column named explicitly must exist in the CSV header.
- Numeric columns must be a number or empty; empty means a break in the line. Anything else errors and names the row number.
- No provenance footnote, no granularity switcher.

---

## Attributes

One contract shared by all three entries. In the tag forms, one attribute per line with double-quoted values; in the code-block form, `key: value` frontmatter.

| Attribute | What it does |
| --- | --- |
| `dataset` | Manifest path, relative to the note's own directory, must end in `.dataset.json`, and may not escape the vault root |
| `type` | `line` / `bar` / `grouped-bar` / `stacked-bar` / `combo` / `combo-dual-axis`; omitted, multi-series charts default to line and single-series to bar |
| `x` | The x-axis field. In external-dataset mode it must be the manifest's time-field name or the literal `period`; in inline mode it defaults to the first CSV column |
| `series` (alias `y`) | Comma-separated series fields. Unset, it falls back to every numeric field with a rollup — in inline mode, to every column except the first |
| `lines` / `bars` (aliases `line` / `bar`) | Splits the combo series into roles. With neither written, the first series is a bar and the rest are lines |
| `from` / `to` | Inclusive range endpoints, `YYYY-MM-DD`, aligned to a source period start (external-dataset mode only) |
| `granularity` | Display granularity, defaulting to `auto` (the finest available); case-insensitive (external-dataset mode only) |
| `granularityOptions` | Comma-separated candidate granularities, rendered as a switcher; defaults to all four (external-dataset mode only) |
| `unit` | The value unit. `%` becomes a suffix on the numbers; `元/¥/cny/rmb` becomes a `¥` prefix and `$/usd` a `$` prefix; every other unit is shown once, in parentheses to the right of the title |
| `leftUnit` / `rightUnit` | The two units of a `combo-dual-axis` chart, each following the rule above; the pair is written as `left / right` in the same spot to the right of the title that `unit` uses |
| `labels` | Value-label switch. One of `0/false/hide/hidden/no/none/off` turns them off; on by default |
| `title` / `note` | Chart title and definition note, rendered in the figure's header and footer |
| `<field>Label` / `<field>Color` | Display name and color (valid hex) for one series. `Label` defaults to the manifest's `label`; colors default to a six-color palette cycled in display order |

`dataset` / `from` / `to` / `granularity` / `granularityOptions` are external-dataset semantics and are not supported in inline mode (paired tag, or code block with inline CSV) — see [the inline-mode boundary](#the-three-forms-at-a-glance) above. The manifest contract and query semantics are in [dataset-guide.md](dataset-guide.md).

## Chart types and display semantics

- `bar` and `grouped-bar` are two names for the same chart: one series draws one column, and n series draw n columns side by side in every period. Write whichever name reads better.
- `stacked-bar`: the same n series stacked into one column per period instead of placed side by side.
- `combo`: one scale for both — the left and right axes are pinned to the same `min: 0` and the same max. Legend order follows the order the attributes are written in (write `lines` before `bars` and the line series come first).
- `combo-dual-axis`: independent left and right axes, with bars always on the left.
- Every chart adds 8% of headroom above its y-axis maximum (for stacked bars, computed on each period's total).
- Line nodes are solid dots. Value labels are thousands-grouped with at most two decimals, and collide gracefully — shown when they fit, hidden when they do not.
- Legend markers are rounded squares for column series and a short bar for line series. Charts follow Obsidian's light and dark themes and reskin in place the moment the theme changes; the figure carries a faint themed border.

**Provenance footnote** (external-dataset mode only). Generated under every chart: `dataset title · from → to · granularity · N/M source rows · data through <date>`. A warning line is appended when the range contains incomplete or missing periods.

---

## Self-closing tag

For long-lived reports: the data stays in an external file and the note only declares which slice to look at and at what granularity. The source file needs no edits to render.

**How to write it.** Self-closing, one attribute per line, double-quoted values:

```text
<Chart
  title="Revenue trend"
  dataset="data/schema/example.dataset.json"
  type="combo"
  x="period"
  lines="Total"
  bars="Segment A,Segment B"
  unit="items"
  labels="all"
  from="2025-01-01"
  to="2025-12-01"
  granularity="month"
  granularityOptions="month,quarter"
  note="Definition notes go here."
/>
```

- The `dataset` path resolves relative to the note's own directory and must end in `.dataset.json`.
- Display details — title, granularity switcher, note, provenance footnote and incomplete-period warning — are covered in [Chart types and display semantics](#chart-types-and-display-semantics) above.

### Error examples (self-closing tag)

Red error box, root cause surfaced in place:

```text
<Chart dataset="no-such-path.dataset.json" type="line" x="period" />
→ Mosaic: Dataset manifest not found in vault: ...

<Chart title="No data source" type="line" x="period" />
→ Mosaic: Chart needs dataset= or an inline CSV body.

<Chart dataset="..." from="2025-01-15" ... />   (monthly source, from not on a month start)
→ Mosaic: Dataset query from must identify a month source period start.

<Chart dataset="..." granularity="week" granularityOptions="month,quarter" ... />
→ Mosaic: Granularity "week" is not in granularityOptions (month,quarter).
```

Renders as source (not taken over, not an error box):

- A literal `/>` inside an attribute value truncates the tag early — a safe refusal.
- An attribute value containing `>` must be double-quoted; a `>` inside single quotes is not recognised (the tag ends early at the `>`) and the whole tag falls back to source.
- The paragraph contains something besides the tag (the general case — see [tag-syntax.md](tag-syntax.md#when-the-source-renders-as-is)).

### It still renders, with a notice

An unrecognized field does **not** void the whole tag. The chart is drawn from what was recognized, and everything that was not is listed verbatim in a notice bar underneath:

- **Attribute names the plugin does not know** — typos, or things Mosaic has not implemented — are listed in the notice.
- **Spaces around `=`.** `title = "Example"` is split into three unrecognized fragments (`title`, `=`, `"Example"`); the chart draws as usual and all three land in the notice.
- **Attributes must be separated by whitespace.** Written flush like `a="1"b="2"`, the second is not recognized and goes to the notice.

> **Non-ASCII attribute names are not in this category.** Writing `营收Label="Revenue"` makes **the entire tag not be taken over** — the paragraph renders as source, with neither a chart nor an error box, rather than "chart plus notice". The interception happens in the host: HTML attribute names may not contain non-ASCII characters, so the opening tag never qualifies at the CommonMark stage. If you need non-ASCII attribute names, use the code-block form; its frontmatter has no such restriction. See [tag-syntax.md](tag-syntax.md).

Only when the unrecognized part is **large enough to look like a misfire** — the unattributed text runs to more than twice the parsed attribute text, or a self-closing tag's leftover text contains `>` — does the whole block fall back to source. Better to decline than to draw something unrecognizable.

---

## Paired tag

For small, one-off content: the data is inline in the note and depends on no external file.

**How to write it.** Attributes on the opening tag, which **must fit on one line**; the CSV goes in a fenced block inside the tag body, and the `csv` language tag may be omitted:

````text
<Chart title="Example" type="combo" x="month" bars="Metric A" lines="Metric B" labels="all">
```csv
month,Metric A,Metric B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
</Chart>
````

- Writing boundaries — single-line opening tag, no blank lines in the body, and so on — are in [tag-syntax.md](tag-syntax.md). (Self-closing tags are exempt from the body rules, having no fence in the body.) When there are too many attributes to fit on one line, switch to the code-block form, whose frontmatter is one attribute per line by nature.
- Between the opening and closing tag there must be nothing but optional whitespace, a CSV fence and optional whitespace. Chart's tag body accepts a CSV fence only and does not use the common row-extraction paths of the other five tag blocks.
- The general inline-mode boundary is at the [top of this page](#the-three-forms-at-a-glance).

### Error examples (paired tag)

Red error box:

````text
An external-dataset attribute such as granularity="month" used with inline data
→ Mosaic: Inline data does not support the "granularity" attribute (dataset charts only).

series="NoSuchColumn"
→ Mosaic: Inline CSV has no "NoSuchColumn" column.

A non-number in a numeric column (for example 2025-01,abc)
→ Mosaic: Inline CSV row 2: "Metric A" value "abc" is not a number.

dataset="..." on the opening tag while the body also carries CSV
→ Mosaic: Provide either dataset= or an inline CSV body, not both.
````

Renders as source (not taken over, not an error box):

- The body has no CSV fence. Bare-text CSV is not recognised — this is specific to Chart.
- A blank line inside the body, a missing `</Chart>`, a mixed paragraph and the other general cases: see [tag-syntax.md](tag-syntax.md#when-the-source-renders-as-is).

---

## Code block

A `chart` code block: a `---` frontmatter attribute section plus an optional inline CSV data section, covering both modes. The frontmatter is flat `key: value`, one per line; values may be quoted; lines starting with `#` are comments; nested structures are not supported — this is a declarative contract, not a pass-through to the charting library's config.

> **`chartview` is an alias of `chart`.** It behaves identically and will not be retired, so existing notes need no rewriting. The language name of every block is the lowercase component name (`chart` / `datatable` / `timeline` / `metricgrid` / `decisionbox` / `flowdiagram`); `chartview` is the one historical exception.

**Form one: reference an external dataset (frontmatter only)** — semantically identical to the self-closing tag's `dataset` mode:

````text
```chart
---
title: "Revenue trend"
dataset: "data/schema/example.dataset.json"
type: combo
x: period
lines: Total
bars: "Metric A,Metric B"
unit: items
granularityOptions: "month,quarter"
---
```
````

**Form two: inline CSV (frontmatter plus a data section)** — drop `dataset` and let the CSV follow the closing `---`:

````text
```chart
---
title: "Revenue trend"
type: line
series: "Metric A,Metric B"
unit: items
---
month,Metric A,Metric B
2025-01,120,140
2025-02,140,150
2025-03,160,155
```
````

**Write the data section bare — do not wrap it in another fence.** A paired tag needs its payload inside a ` ```csv ` fence; a code block does not, because the data section is already inside one. Write an inner fence of the same length and the host reads it as the closing fence of the outer block, truncating everything from that line on.

### Error examples (code block)

Once a code block declares itself `chart` it is always taken over, so every failure shows as a red error box — there is no falling back to source:

````text
No leading "---" attribute section
→ Mosaic: Block must start with a "---" attribute section.

The attribute section has no closing "---"
→ Mosaic: The "---" attribute section is missing its closing "---".

Not a single attribute could be read (the section is not an attribute section at all)
→ Mosaic: No attribute could be read from the "---" section (expected flat key: value lines): ...

Frontmatter has dataset and the block also carries a CSV data section
→ Mosaic: Provide either dataset= or an inline CSV body, not both.

Neither dataset nor a CSV data section
→ Mosaic: Chart needs dataset= or an inline CSV body.
````

**The two `---` boundaries are hard; the attribute lines are not.** A missing opening or closing `---` errors the whole block — that is the code block's structural boundary, and without it there is no telling where attributes end and data begins. Malformed attribute lines do not void the block: indented lines, lines that are not `key: value`, and lines with a `key:` but no value are all skipped, the chart draws as usual, and the notice bar names which lines were skipped (word for word the same as the paired tag — see [the previous section](#it-still-renders-with-a-notice)). Only when **not a single attribute can be read** does the whole block fall back.

Errors in the inline data section — forbidden attributes, invalid numbers, missing columns — are identical to the paired tag; see [above](#error-examples-paired-tag).

---

## What it looks like

> Screenshots always use simulated data, captured live in the dark theme. All three forms look the same and are not screenshotted separately.
>
> **\<pending\>**: every screenshot was taken on 2026-08-15, before this round's frame unification (border, corner radius and background merged into one rule across all six blocks; DataTable's frame lifted from the inner element to the outer one). The frame styling in these images differs from what renders today; they will be retaken together.

**Inline CSV, combo chart** (paired-tag form, value labels including the first and last point):

![Inline combo chart](../_assets/readme-chart.png)

**External dataset, combo-dual-axis** (granularity switcher, `$` and `%` unit formatting, thousands grouping, note and provenance footnote):

![Dataset dual-axis chart](../_assets/chart-dataset.png)

**An error box** (a missing manifest path errors in place without affecting the rest of the page):

![Chart error box](../_assets/chart-error.png)

---

## Related

- [tag-syntax.md](tag-syntax.md) — shared tag rules (host paragraph rules, attribute syntax, renders-as-source cases)
- [dataset-guide.md](dataset-guide.md) — manifest contract, query semantics, troubleshooting
- [design/chart.md](../design/chart.md) — why three forms, why this type system, why this formatting system
- [mosaic-intro.md](../mosaic-intro.md) — overall positioning and roadmap (DataTable / MetricGrid / Timeline / DecisionBox / FlowDiagram and further block types)
