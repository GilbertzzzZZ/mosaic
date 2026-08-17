# MetricGrid

<p align="center"><b>English</b> | <a href="metric-grid-zh.md">简体中文</a></p>

> How to use the MetricGrid block: a set of metric cards in an adaptive grid, each with a status-colored border.
> Two physical forms — a paired tag and a ```` ```metricgrid ```` code block. Same attribute contract, identical rendering.
> Inline payload only: no `dataset` attribute, and no self-closing form (an empty body is an error).
> Shared tag rules are in [tag-syntax.md](tag-syntax.md); the rationale behind the adaptive grid and the status colors is in [design/metric-grid.md](../design/metric-grid.md).

## Writing it

Attributes go on the opening tag, the payload goes in the body:

````text
<MetricGrid title="This week">
```csv
label,value,delta,note,status
Active users,12.4k,+5%,vs last week,good
Retention,42%,-3%,needs attention,watch
Avg order value,$88,+1%,flat,neutral
```
</MetricGrid>
````

Writing boundaries — single-line opening tag, no blank lines in the body, quoting forms and the `=` rule, a closing tag alone on its line and case-sensitive — are in [tag-syntax.md](tag-syntax.md).

**Code-block form.** Attributes go in a `---` block (flat `key: value`, one per line, values may be quoted, `#` starts a comment) and the payload follows the closing `---`.

````text
```metricgrid
---
title: "This week"
---
label,value,delta,note,status
Active users,12.4k,+5%,vs last week,good
Retention,42%,-3%,needs attention,watch
Avg order value,$88,+1%,flat,neutral
```
````

- **Write the payload bare — do not wrap it in another fence.** A paired tag needs its payload inside a ` ```csv ` fence; a code block does not, because the payload is already inside one. Write an inner fence of the same length and the host reads it as the closing fence of the outer block, truncating everything from that line on.
- The opening and closing `---` are hard boundaries — miss one and the whole block errors. The attribute lines themselves are forgiving: malformed lines are skipped, the grid renders anyway, and the notice bar names which lines were skipped. Only when not a single attribute can be read does the whole block fall back.
- The payload contract ([below](#payload-contract)) holds for both forms.

## Attributes

| Attribute | What it does |
| --- | --- |
| `title` | Rendered as the block title; omit it and no title is rendered |

MetricGrid has **no other attributes** — no `dataset`, no granularity, no time range. Writing `dataset="..."` on the tag routes the block down the external-dataset path, where it errors because MetricGrid is not on the supported list (see below).

## Payload contract

The body goes through the [four row-extraction paths](tag-syntax.md#the-four-row-extraction-paths), and each extracted row is normalised through a field-alias chain (first non-empty value wins):

| Output field | Alias priority |
| --- | --- |
| `label` | `label` ?? `metric` ?? `name` ?? `title` |
| `value` | `value` ?? `current` ?? `amount` ?? `count` |
| `delta` | `delta` ?? `change` ?? `mom` ?? `yoy` |
| `note` | `note` ?? `description` ?? `source` ?? `body` |
| `status` | see the table below; input is taken from `status` ?? `trend` ?? `delta` ?? `change` |

Rows where both `label` and `value` are empty are dropped and never rendered.

**Status vocabulary.** Status words are normalised into four buckets:

| Normalised | Matching input |
| --- | --- |
| `good` | `good` / `up` / `positive` / `success` / `active`, or any value starting with `+` |
| `risk` | `risk` / `warning` / `blocked` / `down` / `negative`, or any value starting with `-` |
| `watch` | `watch` / `flat` / `neutral` |
| `neutral` (default) | anything else, or nothing at all |

In other words, a `delta` column starting with `+` or `-` (such as `"+5%"`) colors the card on its own, with no explicit `status`.

**Empty-data error.** Raised when no data row can be parsed at all. If rows do exist but every one is filtered out for having neither label nor value, there is no error — just an empty grid container.

### Error examples

Red error box, root cause surfaced in place, always prefixed with `Mosaic: `:

```text
Empty body, or no parsable payload
→ Mosaic: MetricGrid requires CSV, JSON, or a Markdown table.

A dataset attribute on the tag (MetricGrid has no external-dataset support)
→ Mosaic: External datasets support Chart and DataTable.
```

The cases where the source renders as-is — not taken over, not an error box — are identical for every tag block; see [tag-syntax.md](tag-syntax.md#when-the-source-renders-as-is).

## What it looks like

> Screenshots always use simulated data, captured live in the dark theme.
>
> **\<pending\>**: every screenshot was taken on 2026-08-15, before this round's frame unification (border, corner radius and background merged into one rule across all six blocks; DataTable's frame lifted from the inner element to the outer one). The frame styling in these images differs from what renders today; they will be retaken together.

Adaptive grid with the four status colors — good / risk / watch / neutral — on the top border:

![MetricGrid status cards](../_assets/metric-grid.png)

## Related

- [tag-syntax.md](tag-syntax.md) — shared tag rules and the common row-extraction rules
- [timeline.md](timeline.md) — sibling block with the same field-alias approach
- [design/metric-grid.md](../design/metric-grid.md) — why the grid adapts, why these status colors, why alias chains
- [mosaic-intro.md](../mosaic-intro.md) — overall positioning and roadmap
