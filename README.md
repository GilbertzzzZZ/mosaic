<!-- markdownlint-disable -->

<h1 align="center">Mosaic</h1>

<p align="center"><em>Declarative content blocks for Obsidian</em></p>

<p align="center">
  <a href="https://github.com/GilbertzzzZZ/obsidian-mosaic/releases"><img src="https://img.shields.io/github/v/release/GilbertzzzZZ/obsidian-mosaic?style=for-the-badge&colorA=263238&colorB=4CAF50&label=VERSION" alt="Release"></a>
  <a href="https://obsidian.md"><img src="https://img.shields.io/badge/Obsidian-1.13.0%2B-7C3AED?style=for-the-badge&colorA=263238&colorB=7C3AED" alt="Obsidian"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-1976D2?style=for-the-badge&colorA=263238&colorB=1976D2" alt="License"></a>
</p>

<p align="center"><b>English</b> | <a href="docs/README-zh.md">简体中文</a></p>

<br />

<p align="center">
  <img src="docs/_assets/readme-chart.png" alt="Inline combo chart rendered in reading view" width="760" />
</p>

## Introduction

**Turn a plain-text declaration in your note into a chart, table, timeline or diagram — rendered in place, with no external service and no change to your source file.**

- **Six block types, one contract** — Chart, DataTable, MetricGrid, Timeline, DecisionBox and FlowDiagram all read the same attributes whichever way you write them.
- **Two ways to write every block** — a tag (`<Chart …>`) or a code block (```` ```chart ````). Same result, so pick whichever survives your editing style.
- **Your data stays where it is** — inline CSV, JSON or a Markdown table in the note, or an external `.dataset.json` manifest elsewhere in the vault.
- **Errors never break the page** — a bad block renders one inline error box with the exact line range; the rest of the note renders normally.
- **Nothing leaves your vault** — no network, no telemetry, no account, no code execution.

<p align="center">
  <img src="docs/_assets/readme-blocks.png" alt="MetricGrid and Timeline blocks" width="760" />
</p>

> **\<pending\>** — both screenshots predate the current frame styling. They will be retaken.

## Contents

- [Introduction](#introduction)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Content blocks](#content-blocks)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Privacy and disclosures](#privacy-and-disclosures)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Requirements

- **Obsidian 1.13.0 or later.**
- **Reading view.** Blocks render in reading view only — Live Preview support is planned but not there yet. If you paste an example and see raw text, switch the note with `Cmd/Ctrl + E`.
- **`.md` and `.mdx`.** Obsidian opens `.md` natively. Mosaic additionally registers the `.mdx` extension so those files open in the Markdown editor too — this applies to every `.mdx` file in your vault, whether or not it contains a Mosaic block. If another plugin already claims `.mdx`, Mosaic skips the registration and everything else keeps working.

## Installation

**From Community plugins** (pending directory review): search for "Mosaic" in Settings → Community plugins once listed.

**Manual**: download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/GilbertzzzZZ/obsidian-mosaic/releases/latest), copy them into `<vault>/.obsidian/plugins/mosaic/`, then enable **Mosaic** in Settings → Community plugins.

## Quick start

Paste this into a note and switch to reading view:

````text
<Chart title="Monthly signups" type="combo" x="month" bars="Trials" lines="Signups" labels="all">
```csv
month,Trials,Signups
2025-01,420,120
2025-02,480,140
2025-03,560,160
2025-04,530,150
2025-05,620,180
2025-06,700,200
```
</Chart>
````

The same block written as a code block, with attributes in a `---` block instead of on a tag:

````text
```chart
---
title: "Monthly signups"
type: combo
x: month
bars: Trials
lines: Signups
labels: all
---
month,Trials,Signups
2025-01,420,120
2025-02,480,140
```
````

Both forms hand the parser an identical structure, so every attribute below works in either one.

## Content blocks

| Block | What it does | Data sources |
| --- | --- | --- |
| `Chart` | Line, bar, grouped bar, stacked bar, combo and dual-axis charts | Inline CSV, or external dataset |
| `DataTable` | Sortable data table with automatic column layout | Inline CSV / JSON / Markdown table, or external dataset |
| `MetricGrid` | Status-colored metric cards in an adaptive grid | Inline only |
| `Timeline` | Vertical timeline with status-colored milestones | Inline only |
| `DecisionBox` | Structured decision record, with a free-text fallback that never errors | Inline only |
| `FlowDiagram` | Auto-layout flow diagram (SVG) | Inline only |

<details>
<summary><b>Chart</b> — six chart types, inline or external data</summary>

`type` accepts `line`, `bar`, `grouped-bar`, `stacked-bar`, `combo` and `combo-dual-axis`. Omit it and Mosaic picks `line` for multi-series data, `bar` for single-series.

````text
<Chart title="Weekly active users" type="line" x="week" y="users" unit="people">
```csv
week,users
2025-W01,1240
2025-W02,1310
2025-W03,1180
2025-W04,1420
```
</Chart>
````

Chart also has a third form: a self-closing tag driven by an external dataset manifest, with time-range filtering and granularity roll-up.

```text
<Chart
  dataset="finance.dataset.json"
  type="combo-dual-axis"
  x="AnchorDate"
  bars="Revenue"
  lines="Margin"
  granularity="month"
  granularityOptions="month,quarter"
/>
```

Full attribute table and error catalogue: [docs/guides/chart.md](docs/guides/chart.md).

</details>

<details>
<summary><b>DataTable</b> — inline table or external dataset</summary>

````text
<DataTable title="Open incidents" columns="id,service,severity,owner">
```csv
id,service,severity,owner
INC-104,checkout,high,alice
INC-108,search,medium,bob
INC-111,billing,low,carol
```
</DataTable>
````

`columns` picks which columns to show and in what order; leave it out to render every column found. Payload can also be JSON or a plain Markdown table.

Full attribute table: [docs/guides/data-table.md](docs/guides/data-table.md).

</details>

<details>
<summary><b>MetricGrid</b> — status-colored metric cards</summary>

````text
<MetricGrid title="This week">
```csv
label,value,delta,note,status
Active users,12.4k,+5%,vs last week,good
Retention,42%,-3%,needs attention,risk
Avg order value,$88,+1%,flat,watch
```
</MetricGrid>
````

`status` normalises to four buckets: `good`, `risk`, `watch` and `neutral` (the default). A `delta` starting with `+` or `-` colors the card on its own, so `status` is optional.

Full contract: [docs/guides/metric-grid.md](docs/guides/metric-grid.md).

</details>

<details>
<summary><b>Timeline</b> — vertical milestones</summary>

````text
<Timeline title="Release plan">
```json
[
  {"date":"2026-01-06","title":"Kickoff","body":"Scope locked","status":"done"},
  {"date":"2026-01-13","title":"Design review","body":"Two open risks","status":"blocked"},
  {"date":"2026-01-20","title":"Build","body":"API integration","status":"active"},
  {"date":"2026-01-27","title":"Launch","body":"Not scheduled yet"}
]
```
</Timeline>
````

`status` normalises to `done`, `blocked`, `active` and `default`. No field is required — a row with everything empty just renders an empty node instead of an error.

Full contract: [docs/guides/timeline.md](docs/guides/timeline.md).

</details>

<details>
<summary><b>DecisionBox</b> — structured decision record</summary>

````text
<DecisionBox title="Storage engine" status="accepted" owner="alice" source="RFC-001">
```csv
label,value
Decision,Use SQLite for local cache
Cost,Roughly two weeks of migration
Alternatives,Postgres (too heavy), flat files (no queries)
```
</DecisionBox>
````

`status` accepts `accepted`, `proposed`, `rejected` and `superseded`, each with its own accent color. DecisionBox is the one block that never errors on an unstructured payload — write a sentence instead of rows and it renders as prose.

Full contract: [docs/guides/decision-box.md](docs/guides/decision-box.md).

</details>

<details>
<summary><b>FlowDiagram</b> — auto-layout flow diagram</summary>

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

A row-based form also works — one row per node, with a `next` column generating the edges:

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

Full contract: [docs/guides/flow-diagram.md](docs/guides/flow-diagram.md).

</details>

## Troubleshooting

**I see the raw text instead of a chart.** Blocks render in reading view. Switch with `Cmd/Ctrl + E`.

**My tag isn't picked up at all — the note shows it verbatim.** Three host-level rules govern tags, and all three come from how Obsidian splits paragraphs, not from Mosaic:

1. **The opening tag must sit on one line.** Breaking attributes across lines makes Obsidian treat it as an ordinary paragraph.
2. **No blank lines inside the tag body.** A blank line ends the HTML block early, so the fence and closing tag become separate paragraphs.
3. **The closing tag needs its own line**, spelled exactly like the opening one (`</DataTable>`, case-sensitive).

Attribute names must also be plain ASCII. **The code block form has none of these limits** — reach for it whenever a tag misbehaves or you need non-ASCII attribute names.

**I get "Provide either dataset= or an inline body, not both."** The two data sources are deliberately exclusive: there is no sane way to merge an external dataset with inline rows, so Mosaic refuses rather than inventing a rule.

**A chart is blank but there's no error box.** Reading view renders sections lazily. Scroll the block into view; if it stays blank, reopen the note.

## Roadmap

- **Live Preview rendering** — the most requested gap; blocks currently render in reading view only.
- **More block types** — the six built-ins are the starting set, not the ceiling.

Detailed positioning and architecture notes: [docs/mosaic-intro.md](docs/mosaic-intro.md).

## Documentation

The README and the intro below are in English. The per-block reference guides are currently written in Chinese — each one carries the full attribute table, the payload contract and a catalogue of error messages.

- [Mosaic intro](docs/mosaic-intro.md) ([中文](docs/mosaic-intro-zh.md)) — positioning, architecture and roadmap *(English)*
- [Tag syntax](docs/guides/tag-syntax.md) — rules shared by all tag blocks, row extraction, fall-back-to-source cases
- [Chart](docs/guides/chart.md) — all three syntaxes, full attribute table, error examples
- [DataTable](docs/guides/data-table.md) — inline tables or external datasets
- [MetricGrid](docs/guides/metric-grid.md) — status-colored metric cards
- [Timeline](docs/guides/timeline.md) — status-colored vertical timeline
- [DecisionBox](docs/guides/decision-box.md) — structured label/value list, or free-text fallback
- [FlowDiagram](docs/guides/flow-diagram.md) — auto-layout flow diagram, graph JSON or row form
- [Dataset guide](docs/guides/dataset-guide.md) — dataset manifest contract, query semantics, troubleshooting

Design notes (why it works this way): [architecture](docs/design/architecture.md), plus one document per block type in [docs/design/](docs/design/).

## Privacy and disclosures

Mosaic is fully local and fully offline:

- **No network requests.** Nothing is fetched, uploaded or phoned home.
- **No telemetry or analytics**, client-side or server-side.
- **No account, no payment, no ads.** Every feature works out of the box.
- **No file access outside your vault.** Dataset manifests are resolved relative to the note that references them and read through Obsidian's own vault API.
- **No code execution.** No SQL, no formula evaluation, no scripts — declarations are parsed, never evaluated.

Charts are rendered by [Ant Design Charts](https://github.com/ant-design/ant-design-charts) (AntV), bundled into `main.js` under the MIT license.

## Development

```bash
npm install
npm test        # node --test, pure data-layer modules
npm run build   # tsc typecheck + esbuild bundle -> main.js
```

Release procedure: [docs/guides/publishing-to-obsidian.md](docs/guides/publishing-to-obsidian.md).

## Contributing

Bug reports and feature requests go to [Issues](https://github.com/GilbertzzzZZ/obsidian-mosaic/issues). For a rendering bug, please include:

- The block declaration itself (the copy button on each block's error box produces a ready-to-paste report).
- Your Obsidian version and Mosaic version.
- Whether the note is `.md` or `.mdx`.

## License

MIT. See [LICENSE](LICENSE).
