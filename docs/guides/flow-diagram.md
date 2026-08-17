# FlowDiagram

*[中文版](flow-diagram-zh.md)*

> How to use the FlowDiagram block: an automatically layered flow diagram (SVG), with two mutually exclusive payload shapes — an explicit graph JSON, or tabular rows where a `next` column generates the edges.
> Two physical forms: a paired tag and a ```` ```flowdiagram ```` code block. Same attribute contract, identical rendering.
> Inline payload only: no `dataset` attribute, and no self-closing form (an empty body is an error).
> Shared tag rules are in [tag-syntax.md](tag-syntax.md); the rationale behind the layered layout and the cycle degradation is in [design/flow-diagram.md](../design/flow-diagram.md).

## Writing it

**Shape A (graph JSON).** Attributes go on the opening tag; the payload is a single ` ```json ` fence whose top level is a `{nodes, edges}` object:

````text
<FlowDiagram title="Incident response">
```json
{
  "nodes": [
    {"id": "a", "label": "Alert fires", "type": "start"},
    {"id": "b", "label": "Page on-call?", "type": "decision"},
    {"id": "c", "label": "Resolve", "type": "end"}
  ],
  "edges": [
    {"from": "a", "to": "b"},
    {"from": "b", "to": "c", "label": "yes"}
  ]
}
```
</FlowDiagram>
````

**Shape B (tabular rows, the fallback).** The payload goes through the common row-extraction rules (CSV / TSV / a JSON array / a bare Markdown table all work). Each row is a node, and the `next` column — comma-separated, so several target ids are fine — generates the edges implicitly, with no separate edge table:

````text
<FlowDiagram title="Incident response">
```csv
id,label,type,next
a,Alert fires,start,b
b,Page on-call?,decision,c
c,Resolve,end,
```
</FlowDiagram>
````

- **How the shape is decided.** If the body is a single fence whose language tag is exactly `json` (or bare text starting with `{` / `[`), and the parsed top-level value is a non-array object whose `nodes` field is an array → shape A. Everything else falls back to shape B and goes through common row extraction. Writing ` ```csv ` around content that happens to be valid JSON does **not** get it parsed as a graph; it is still treated as CSV.
- **Both shapes converge on the same normalisation.** Even on shape A, a node's `next` / `to` field is *still* used to generate implicit edges, which are appended after the explicit `edges` array. The two are merged, not deduplicated. Any edge referencing a node id that does not exist — explicit or `next`-derived — is silently dropped without an error.
- Writing boundaries — single-line opening tag, no blank lines in the body, quoting forms and the `=` rule, a closing tag alone on its line and case-sensitive — are in [tag-syntax.md](tag-syntax.md).

**Code-block form.** Attributes go in a `---` block (flat `key: value`, one per line, values may be quoted, `#` starts a comment) and the payload follows the closing `---`. Both shapes work here — **bare JSON starts with `{`, which is exactly what shape A tests for**:

````text
```flowdiagram
---
title: "Incident response"
---
{
  "nodes": [
    {"id": "a", "label": "Alert fires", "type": "start"},
    {"id": "b", "label": "Page on-call?", "type": "decision"},
    {"id": "c", "label": "Resolve", "type": "end"}
  ],
  "edges": [
    {"from": "a", "to": "b"},
    {"from": "b", "to": "c", "label": "yes"}
  ]
}
```
````

Shape B, written just as bare:

````text
```flowdiagram
---
title: "Incident response"
---
id,label,type,next
a,Alert fires,start,b
b,Page on-call?,decision,c
c,Resolve,end,
```
````

- **Write the payload bare — do not wrap it in another fence.** A paired tag needs its payload inside a ` ```json ` or ` ```csv ` fence; a code block does not, because the payload is already inside one. Write an inner fence of the same length and the host reads it as the closing fence of the outer block, truncating everything from that line on.
- With no fence language tag to go by, the content decides the shape: starts with `{` and has an array at top-level `nodes` → shape A, otherwise shape B. The two examples above hit one rule each.
- The opening and closing `---` are hard boundaries — miss one and the whole block errors. The attribute lines themselves are forgiving: malformed lines are skipped, the diagram renders anyway, and the notice bar names which lines were skipped. Only when not a single attribute can be read does the whole block fall back.

## Attributes

| Attribute | What it does |
| --- | --- |
| `title` | Rendered in the block header (same position as the other four blocks) and used as the SVG's `aria-label`; unset, the `aria-label` defaults to `Flow diagram` |
| `note` | Caption text under the diagram |

FlowDiagram has **no other attributes** — no `dataset`. Writing `dataset="..."` on the tag routes the block down the external-dataset path, where it errors because FlowDiagram is not on the supported list (see below).

## Payload contract

**Shape A, top-level structure:**

```json
{
  "nodes": [ { "id": "...", "label": "...", "type": "...", "note": "...", "next": "..." } ],
  "edges": [ { "from": "...", "to": "...", "label": "..." } ]
}
```

The edge array may be named `edges` or `links` (`edges` wins).

**Shape B** goes through the [four row-extraction paths](tag-syntax.md#the-four-row-extraction-paths).

**Node normalisation** (both shapes end up here):

| Output field | Alias priority |
| --- | --- |
| `id` | `id` ?? `key` ?? its 1-based index; nodes whose id is empty after trimming are dropped |
| `label` | `label` ?? `title` ?? `name` ?? `id` |
| `type` | see the table below |
| `note` | `note` ?? `description`, rendered as the SVG's native hover tooltip |
| `next` (only used to generate implicit edges) | `next` ?? `to`, comma-separated for several target ids |

**Edge normalisation.** `from` / `to` accept the aliases `source` / `target`; `label` accepts the alias `title`. Edges referencing a node id that does not exist are silently filtered out.

**Type vocabulary.** Type words are normalised automatically, defaulting to `action`:

| Normalised | Matching input |
| --- | --- |
| `start` | explicit `start` |
| `end` | explicit `end` |
| `decision` | explicit `decision`, or `question` / `branch` / `condition` |
| `gate` | explicit `gate` |
| `risk` | explicit `risk`, or `warning` / `blocked` / `error` |
| `action` (default) | anything else, or nothing at all |

**Automatic layering.** Nodes are assigned to layers by longest-path topological sort following each edge's `from → to` direction (evenly spaced horizontally within a layer, layers stacked downward), and edges are drawn as cubic Bézier curves. **Cycle degradation:** if the graph contains a cycle, the nodes inside it are never reached by the topological walk. Once the walk finishes, those unvisited nodes are appended in input order to "deepest layer +1, +2, +3…", each isolated or in-cycle node getting a layer of its own. In other words a cycle is straightened into a vertical chain rather than laid out as an actual loop.

**Minimal cycle example** (made-up data, an `a → b → c → a` three-node cycle):

````text
<FlowDiagram title="A cycle, degraded">
```csv
id,label,type,next
a,Node A,action,b
b,Node B,action,c
c,Node C,action,a
```
</FlowDiagram>
````

The three nodes are pulled apart into three stacked layers rather than folded into a visual loop.

**Empty-data error.** Raised when no valid node can be parsed — a populated `edges` array is not enough if not a single node has a non-empty id.

### Error examples

Red error box, root cause surfaced in place, always prefixed with `Mosaic: `:

```text
Empty body, or neither shape yields a valid node
→ Mosaic: FlowDiagram requires nodes.

A dataset attribute on the tag (FlowDiagram has no external-dataset support)
→ Mosaic: External datasets support Chart and DataTable.
```

The cases where the source renders as-is — not taken over, not an error box — are identical for every tag block; see [tag-syntax.md](tag-syntax.md#when-the-source-renders-as-is).

## What it looks like

> Screenshots always use simulated data, captured live in the dark theme. Shape A (graph JSON) and shape B (tabular rows) lay out identically and are not screenshotted separately.
>
> **\<pending\>**: every screenshot was taken on 2026-08-15, before this round's frame unification (border, corner radius and background merged into one rule across all six blocks; DataTable's frame lifted from the inner element to the outer one). The frame styling in these images differs from what renders today; they will be retaken together.

Layered DAG layout, six node colors, edge labels and arrowheads:

![FlowDiagram layout](../_assets/flow-diagram.png)

## Related

- [tag-syntax.md](tag-syntax.md) — shared tag rules and the common row-extraction rules
- [data-table.md](data-table.md) — sibling block that also accepts several inline payload forms
- [design/flow-diagram.md](../design/flow-diagram.md) — why two shapes, why this layering, why cycles degrade
- [mosaic-intro.md](../mosaic-intro.md) — overall positioning and roadmap
