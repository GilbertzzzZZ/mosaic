# DecisionBox

<p align="center"><b>English</b> | <a href="decision-box-zh.md">简体中文</a></p>

> How to use the DecisionBox block: a structured label/value decision record, or — when the payload has no usable rows — a minimal rich-text fallback.
> Two physical forms: a paired tag and a ```` ```decisionbox ```` code block, sharing one attribute contract. Inline payload only — no `dataset` attribute.
> DecisionBox is the one block of the five that **never errors on an empty or unstructured payload** (misusing `dataset`, or malformed JSON, still errors — see "Error examples").
> **Multi-paragraph rich text only works in the code-block form** — the reason is below.
> Shared tag rules are in [tag-syntax.md](tag-syntax.md); the rationale behind the two paths and the never-error stance is in [design/decision-box.md](../design/decision-box.md).

## What it looks like

> Screenshots always use simulated data, captured live in the dark theme.
>
> **\<pending\>**: every screenshot was taken on 2026-08-15, before this round's frame unification (border, corner radius and background merged into one rule across all six blocks; DataTable's frame lifted from the inner element to the outer one). The frame styling in these images differs from what renders today; they will be retaken together.

Structured label/value in two columns, with status / owner / source badges (an accepted and a proposed record).

> **\<pending\>**: this image predates the status colors — neither box has a colored left border. Today `accepted` is green and `proposed` is the theme accent.

![DecisionBox records](../_assets/decision-box.png)

## Writing it

**Structured label/value data.** Attributes go on the opening tag, the payload is label/value rows:

````text
<DecisionBox title="Storage engine" status="accepted" owner="alice" source="RFC-001">
```csv
label,value
Decision,Use SQLite for the local cache
Cost,Roughly two weeks of migration
```
</DecisionBox>
````

**Free-text fallback** (no structured data, or no usable label/value in the data):

```text
<DecisionBox title="Storage engine">
We are going with SQLite: simple to implement, and the migration cost is contained.
</DecisionBox>
```

- Writing boundaries — single-line opening tag, no blank lines in the body, and the rest — are in [tag-syntax.md](tag-syntax.md).
- **"No blank lines in the body" hits DecisionBox's rich-text fallback especially hard.** The rich-text path splits on blank lines, but a blank line anywhere in the body stops the tag from being taken over at all. So **the free-text fallback can only carry a single paragraph or one unordered list**: writing several paragraphs (with blank lines between them) makes the whole tag render as source rather than producing several `<p>` elements. When you need multi-paragraph prose, switch to structured label/value rows, where no line is blank.
- Unordered lists (lines starting with `- ` or `* `) are safe inside one paragraph, because list items need no blank lines between them:

```text
<DecisionBox title="Storage engine">
- Upside: simple to implement
- Downside: limited headroom
</DecisionBox>
```

**Code-block form.** Attributes go in a `---` block (flat `key: value`, one per line, values may be quoted, `#` starts a comment) and the payload follows the closing `---`.

````text
```decisionbox
---
title: "Storage engine"
status: accepted
owner: alice
source: RFC-001
---
label,value
Decision,Use SQLite for the local cache
Cost,Roughly two weeks of migration
```
````

**The code block lifts the single-paragraph limit on the rich-text fallback.** "No blank lines in the body" is the host's paragraph-splitting rule and it governs tags; a code block is not subject to it, because its boundary is the fence and a blank line inside is just a blank line. So multi-paragraph prose written as a code block renders as several `<p>` elements:

````text
```decisionbox
---
title: "Storage engine"
---
We are going with SQLite: simple to implement, and the migration cost is contained.

Second paragraph: the migration ships in two waves — internal environments first, then production.
```
````

- **Write the payload bare — do not wrap it in another fence.** A paired tag needs its structured payload inside a ` ```csv ` fence; a code block does not, because the payload is already inside one. Write an inner fence of the same length and the host reads it as the closing fence of the outer block, truncating everything from that line on.
- The opening and closing `---` are hard boundaries — miss one and the whole block errors. The attribute lines themselves are forgiving: malformed lines are skipped, the box renders anyway, and the notice bar names which lines were skipped. Only when not a single attribute can be read does the whole block fall back.
- The attribute table and payload contract hold for both forms, `status` / `owner` / `source` normalisation included.

## Attributes

| Attribute | What it does | Normalisation |
| --- | --- | --- |
| `title` | Rendered as the block title; omit it and no title is rendered | none |
| `status` (alias `decisionStatus`; `status` wins when both are present) | The status badge, and the CSS variant of the outer container | see below |
| `owner` | Owner badge | passed through verbatim |
| `source` | Source badge | passed through verbatim |

DecisionBox has **no `dataset` support**. Writing `dataset="..."` on the tag routes the block down the external-dataset path, where it errors because DecisionBox is not on the supported list (see below).

**Status vocabulary.** Status words are normalised automatically:

| Normalised | Matching input |
| --- | --- |
| `accepted` / `proposed` / `rejected` / `superseded` | one of these four written explicitly, passed through as-is |
| `accepted` | `done` / `complete` / `completed` |
| `default` | any other non-empty value |
| `""` (no badge rendered) | unset or empty string |

**The normalised result decides the left border color** (from the theme's extended palette):

| Status | Left border |
| --- | --- |
| `accepted` | green |
| `rejected` | red |
| `proposed` | theme accent (same sense as Timeline's `active`: proposed, not settled) |
| `superseded` | grey (replaced by a later decision — not a failure, just out of date) |
| `default` / unset | no color, stays neutral |

**The badge shows the raw attribute value, not the normalised result.** Write `status="done"` and the badge reads `done`, while the left border turns green as `accepted`. Normalisation only affects color.

Fixed copy: the block header carries a non-configurable kicker in its top-left corner reading `Decision` (CSS renders it uppercase). It is not a data field and is always shown.

## Payload contract

The body goes through the [four row-extraction paths](tag-syntax.md#the-four-row-extraction-paths); the resulting rows are then normalised through the label/value alias chain:

| Output field | Alias priority |
| --- | --- |
| `label` | `label` ?? `key` ?? `name` ?? `item` |
| `value` | `value` ?? `text` ?? `body` ?? `description` ?? `summary` |

Rows where both `label` and `value` are empty are filtered out.

**Two mutually exclusive paths:**

- **Path A (structured).** Taken when at least one label/value row survives filtering; renders a `<dl>` definition list. `value` supports two inline Markdown constructs — `` `code` `` and `**bold**` — and escapes everything else verbatim (no italics, links, strikethrough, headings or blockquotes).
- **Path B (rich-text fallback).** Taken when zero label/value rows survive; renders the whole tag body as minimal Markdown — split into paragraphs on blank lines (subject to the Obsidian limitation above, so in practice only one paragraph gets through), lines starting with `- ` or `* ` grouped into an unordered list, and every other non-empty line joined into a single paragraph.

**It never errors.** Even a completely empty body (or a self-closing tag with no body) just renders an empty rich-text block rather than an error box. This is the key difference between DecisionBox and DataTable / Timeline / MetricGrid / FlowDiagram — those four error on empty rows, DecisionBox does not.

### Error examples

DecisionBox has no empty-data error path at all. Only two situations produce a red error box:

```text
A dataset attribute on the tag (DecisionBox has no external-dataset support)
→ Mosaic: External datasets support Chart and DataTable.

Invalid JSON inside a fenced json block
→ Mosaic: Unexpected token ... in JSON at position ...
  (the native JSON parse error; wording varies with the failure position)
```

The second is not specific to DecisionBox — it is how [common row extraction](tag-syntax.md#the-four-row-extraction-paths) handles malformed JSON everywhere.

The cases where the source renders as-is — not taken over, not an error box — are identical for every tag block; see [tag-syntax.md](tag-syntax.md#when-the-source-renders-as-is). Note that "a blank line inside the tag body" is what makes multi-paragraph rich text unusable in the tag form, as explained above.

## Related

- [tag-syntax.md](tag-syntax.md) — shared tag rules and the common row-extraction rules
- [timeline.md](timeline.md) · [metric-grid.md](metric-grid.md) — sibling blocks that normalise status through a vocabulary too
- [design/decision-box.md](../design/decision-box.md) — why two paths, why status normalisation, why this minimal Markdown subset
- [mosaic-intro.md](../mosaic-intro.md) — overall positioning and roadmap
