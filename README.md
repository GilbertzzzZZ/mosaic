# Mosaic

Declarative content blocks for [Obsidian](https://obsidian.md) notes: write a declaration in md / mdx, get rich interactive content — no changes to the source file, no external site required. Notes compose like a mosaic, one block at a time: charts are available today; metric grid, card and other block types are planned.

## What it looks like

![DualAxes](https://user-images.githubusercontent.com/150803/119969638-618b5480-bfe1-11eb-8a36-0a5d60408b00.png)

![Pie](https://user-images.githubusercontent.com/150803/119069882-87c95700-ba19-11eb-8cef-02d1e021d1a2.png)

## Entries

| Entry | Syntax | Data sources |
| --- | --- | --- |
| Chart tag | Self-closing `<Chart ... />` in md / mdx body | External dataset manifests (`.dataset.json`) with time-range filtering and granularity rollup |
| Code block | ```` ```chartview ```` fenced block | Inline YAML data, vault CSV files, Dataview queries |
| Paired tag | `<Block>payload</Block>` | Planned |

Charts follow the Obsidian light / dark theme, format values (thousands grouping, `%` and currency units) and render in reading view.

## Documentation

- [Mosaic intro](docs/mosaic-intro.md) ([中文](docs/mosaic-intro-zh.md)) — positioning, architecture and roadmap
- [Dataset guide](docs/dataset-guide.md) — Chart tag syntax, dataset manifest contract, query semantics, troubleshooting
- [Code-block charts](docs/code-block-charts.md) — `chartview` block reference: templates, wizard, CSV, Dataview, interactions

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
