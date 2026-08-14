# Mosaic

Declarative content blocks for [Obsidian](https://obsidian.md) notes: write a declaration in md / mdx, get rich interactive content — no changes to the source file, no external site required. Notes compose like a mosaic, one block at a time: charts are available today; metric grid, card and other block types are planned.

## What it looks like

![DualAxes](https://user-images.githubusercontent.com/150803/119969638-618b5480-bfe1-11eb-8a36-0a5d60408b00.png)

![Pie](https://user-images.githubusercontent.com/150803/119069882-87c95700-ba19-11eb-8cef-02d1e021d1a2.png)

## Entries

| Entry | Syntax | Data |
| --- | --- | --- |
| Chart tag (self-closing) | `<Chart ... />` in md / mdx body | External dataset manifests (`.dataset.json`) with time-range filtering and granularity rollup |
| Chart tag (paired) | `<Chart ...>` + fenced CSV + `</Chart>` | Inline CSV in the note body |
| Code block | ```` ```chartview ```` with `---` frontmatter | External dataset manifests, or inline CSV below the frontmatter |
| Other block types (MetricGrid, DataTable, Card) | Paired tags | Planned |

Charts follow the Obsidian light / dark theme, format values (thousands grouping, `%` and currency units) and render in reading view.

## Documentation

- [Mosaic intro](docs/mosaic-intro.md) ([中文](docs/mosaic-intro-zh.md)) — positioning, architecture and roadmap
- [Chart tag](docs/chart-tag.md) — self-closing `<Chart />` entry: syntax and rendering effects
- [Dataset guide](docs/dataset-guide.md) — dataset manifest contract, query semantics, troubleshooting
- [Code block](docs/code-block.md) — `chartview` block reference: `---` frontmatter contract, external dataset or inline CSV
- [Paired tag](docs/paired-tag.md) — attributes on the tag, payload in the body; `<Chart>` inline CSV is available

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
