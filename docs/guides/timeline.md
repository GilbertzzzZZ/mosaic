# Timeline

<p align="center"><b>English</b> | <a href="timeline-zh.md">简体中文</a></p>

> How to use the Timeline block: a vertical list of milestones, each with a status-colored dot.
> Two physical forms — a paired tag and a ```` ```timeline ```` code block. Same attribute contract, identical rendering.
> Inline payload only: no `dataset` attribute, and no self-closing form (an empty body is an error).
> Shared tag rules are in [tag-syntax.md](tag-syntax.md); the rationale behind the vertical structure and the forgiving rendering is in [design/timeline.md](../design/timeline.md).

## What it looks like

> Screenshots always use simulated data, captured live in the dark theme.
>
> **\<pending\>**: every screenshot was taken on 2026-08-15, before this round's frame unification (border, corner radius and background merged into one rule across all six blocks; DataTable's frame lifted from the inner element to the outer one). The frame styling in these images differs from what renders today; they will be retaken together.

A vertical timeline joined by a rule and truncated after the last item, with done / active / default status dots (`active` follows Obsidian's accent color):

![Timeline milestones](../_assets/timeline.png)

## Writing it

Attributes go on the opening tag, the payload goes in the body:

````text
<Timeline title="Release plan">
```json
[
  {"date":"2026-01-01","title":"Kickoff","body":"Scope approved","status":"done"},
  {"date":"2026-01-08","title":"Design review","body":"Two open risks","status":"blocked"},
  {"date":"2026-01-15","title":"Build","body":"API integration","status":"active"},
  {"date":"2026-01-22","title":"Launch","body":"Not scheduled yet","status":"other"}
]
```
</Timeline>
````

Writing boundaries — single-line opening tag, no blank lines in the body, quoting forms and the `=` rule, a closing tag alone on its line and case-sensitive — are in [tag-syntax.md](tag-syntax.md).

**Code-block form.** Attributes go in a `---` block (flat `key: value`, one per line, values may be quoted, `#` starts a comment) and the payload follows the closing `---`.

````text
```timeline
---
title: "Release plan"
---
[
  {"date":"2026-01-01","title":"Kickoff","body":"Scope approved","status":"done"},
  {"date":"2026-01-08","title":"Design review","body":"Two open risks","status":"blocked"},
  {"date":"2026-01-15","title":"Build","body":"API integration","status":"active"},
  {"date":"2026-01-22","title":"Launch","body":"Not scheduled yet","status":"other"}
]
```
````

- **Write the payload bare — do not wrap it in another fence.** A paired tag needs its payload inside a ` ```json ` fence; a code block does not, because the payload is already inside one. Write an inner fence of the same length and the host reads it as the closing fence of the outer block, truncating everything from that line on.
- The opening and closing `---` are hard boundaries — miss one and the whole block errors. The attribute lines themselves are forgiving: malformed lines are skipped, the timeline renders anyway, and the notice bar names which lines were skipped. Only when not a single attribute can be read does the whole block fall back.
- The payload contract ([below](#payload-contract)) holds for both forms: CSV, JSON and Markdown tables all go through the same row extraction.

## Attributes

| Attribute | What it does |
| --- | --- |
| `title` | Rendered as the block title; omit it and no title is rendered |

Timeline has **no other attributes** — no `dataset`. Writing `dataset="..."` on the tag routes the block down the external-dataset path, where it errors because Timeline is not on the supported list (see below).

## Payload contract

The body goes through the [four row-extraction paths](tag-syntax.md#the-four-row-extraction-paths), and each extracted row is normalised through a field-alias chain (first non-empty value wins):

| Output field | Alias priority |
| --- | --- |
| `date` | `date` ?? `time` ?? `month` |
| `title` | `title` ?? `name` ?? `event` |
| `body` | `body` ?? `description` ?? `summary` ?? `note` |
| `owner` | `owner` ?? `assignee` |
| `status` | see the table below |

**No field is required.** Even a row where `date`, `title`, `body` and `owner` are all empty renders — as an empty shell node, since each field only renders its child element when non-empty.

**Status vocabulary.** Status words are normalised into four buckets, defaulting to `default`:

| Normalised | Matching input |
| --- | --- |
| `done` | `done` / `complete` / `completed` / `success` |
| `blocked` | `blocked` / `risk` / `warning` |
| `active` | `active` / `doing` / `progress` / `in-progress` |
| `default` (default) | anything else, or nothing at all |

Note that `risk` and `warning` fall into the `blocked` bucket rather than a bucket of their own — similar in name to MetricGrid's `risk` bucket but different in meaning, which is easy to confuse.

**Empty-data error.** Raised when no data row can be parsed at all.

### Error examples

Red error box, root cause surfaced in place, always prefixed with `Mosaic: `:

```text
Empty body, or no parsable rows
→ Mosaic: Timeline requires CSV, JSON, or a Markdown table.

A dataset attribute on the tag (Timeline has no external-dataset support)
→ Mosaic: External datasets support Chart and DataTable.
```

The cases where the source renders as-is — not taken over, not an error box — are identical for every tag block; see [tag-syntax.md](tag-syntax.md#when-the-source-renders-as-is).

## Related

- [tag-syntax.md](tag-syntax.md) — shared tag rules and the common row-extraction rules
- [metric-grid.md](metric-grid.md) — sibling block with the same field-alias approach
- [design/timeline.md](../design/timeline.md) — why the vertical structure, the status dots and the forgiving rendering
- [mosaic-intro.md](../mosaic-intro.md) — overall positioning and roadmap
