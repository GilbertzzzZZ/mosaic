# Mosaic

Declarative content blocks for [Obsidian](https://obsidian.md) notes: write a declaration in md / mdx, get rich interactive content — no changes to the source file, no external site required. Notes compose like a mosaic, one block at a time: Chart, DataTable, MetricGrid, Timeline, DecisionBox and FlowDiagram are available today; more block types are planned.

## What it looks like

![DualAxes](https://user-images.githubusercontent.com/150803/119969638-618b5480-bfe1-11eb-8a36-0a5d60408b00.png)

![Pie](https://user-images.githubusercontent.com/150803/119069882-87c95700-ba19-11eb-8cef-02d1e021d1a2.png)

## Entries

| Entry | Syntax | Data |
| --- | --- | --- |
| Chart tag (self-closing) | `<Chart ... />` in md / mdx body | External dataset manifests (`.dataset.json`) with time-range filtering and granularity rollup |
| Chart tag (paired) | `<Chart ...>` + fenced CSV + `</Chart>` | Inline CSV in the note body |
| Code block | ```` ```chartview ```` with `---` frontmatter | External dataset manifests, or inline CSV below the frontmatter |
| DataTable tag | Paired tag (inline CSV/JSON/Markdown table), or self-closing tag with `dataset` | Inline data, or external dataset manifests |
| MetricGrid tag | Paired tag | Inline CSV/JSON/Markdown table |
| Timeline tag | Paired tag | Inline CSV/JSON/Markdown table |
| DecisionBox tag | Paired tag | Inline label/value rows, or free-text fallback (never errors) |
| FlowDiagram tag | Paired tag | Inline graph JSON, or row-form with implicit `next` edges |

Charts follow the Obsidian light / dark theme, format values (thousands grouping, `%` and currency units) and render in reading view. The five block types above only support the tag entries (not the `chartview` code block) and share the same tag-parsing rules as Chart's paired form.

## Documentation

- [Mosaic intro](docs/mosaic-intro.md) ([中文](docs/mosaic-intro-zh.md)) — positioning, architecture and roadmap
- [Chart](docs/chart.md) — the chart block: all three syntaxes (self-closing tag, paired tag, code block), each with error examples
- [DataTable](docs/data-table.md) — inline table (CSV/JSON/Markdown) or external dataset, shares the dataset query layer with Chart
- [MetricGrid](docs/metric-grid.md) — status-colored metric cards
- [Timeline](docs/timeline.md) — status-colored vertical timeline
- [DecisionBox](docs/decision-box.md) — structured label/value list, or free-text fallback
- [FlowDiagram](docs/flow-diagram.md) — auto-layout flow diagram, graph JSON or row-form
- [Dataset guide](docs/dataset-guide.md) — dataset manifest contract, query semantics, troubleshooting

## Installing

Copy the build artifacts into your vault and enable the plugin:

```bash
npm install && npm run build
mkdir -p <vault>/.obsidian/plugins/mosaic
cp main.js manifest.json styles.css <vault>/.obsidian/plugins/mosaic/
```

Then Settings → Community plugins → enable **Mosaic**.

## Development

```bash
npm install
npm test        # node --test, pure data-layer modules
npm run build   # esbuild bundle -> main.js
```

## License

MIT. Portions of the data layer are ported from Apache-2.0 licensed code; see [NOTICE](NOTICE).
