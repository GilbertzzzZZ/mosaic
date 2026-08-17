# External datasets

<p align="center"><b>English</b> | <a href="dataset-guide-zh.md">简体中文</a></p>

> How to use external datasets: the manifest contract, the query semantics and a troubleshooting list. Chart and DataTable share all of this in their `dataset` mode — `from` / `to` / `granularity` / `granularityOptions`, the granularity switcher and the provenance footnote behave identically in both.
> This page does not cover the tag syntax or attribute tables on the note side. For Chart see [chart.md](chart.md) (the single source of truth for attributes), for DataTable see [data-table.md](data-table.md). The rationale behind the contract is in the external-dataset section of [design/architecture.md](../design/architecture.md).

## Referencing a dataset from a note

Point the `dataset` attribute at a manifest (path relative to the note's own directory, and it must end in `.dataset.json`), then use `from` / `to` / `granularity` / `granularityOptions` to declare which slice to look at and at what granularity. The full syntax and attribute tables are in [chart.md](chart.md) and [data-table.md](data-table.md) and are not repeated here.

**Provenance footnote.** Every chart and table gets one generated underneath: `dataset title · from → to · granularity · N/M source rows · data through <date>`. A warning line is appended when the range contains incomplete or missing periods.

---

## The dataset manifest contract

A sidecar next to the data file, with a filename ending in `.dataset.json`:

```json
{
  "schemaVersion": 1,
  "id": "monthly-active-paid-rate",
  "title": "Monthly active paid rate",
  "description": "How this metric is defined — read before pulling numbers",
  "data": "../monthly-active-paid-rate.csv",
  "format": "csv",
  "grain": ["AnchorDate"],
  "primaryKey": ["AnchorDate"],
  "time": {
    "field": "AnchorDate",
    "type": "date",
    "timezone": "Asia/Shanghai",
    "weekStartsOn": "monday",
    "calendar": "calendar",
    "sourceGranularity": "month"
  },
  "fields": [
    { "name": "AnchorDate", "type": "date", "required": true },
    {
      "name": "ActivePaidRate",
      "label": "Active paid rate",
      "description": "Field-level definition",
      "type": "decimal",
      "unit": "%",
      "required": true,
      "rollup": "avg",
      "numberFormat": "comma-grouped"
    }
  ]
}
```

**Key points**

- `data` resolves relative to the manifest's own directory. `format` accepts `csv` / `tsv` / `json`; omit it and the extension decides.
- `rollup` defines the roll-up semantics: `sum` / `avg` / `min` / `max` / `count` / `first` / `last`, or `{ "op": "ratioOfSums", "numerator": "...", "denominator": "...", "scale": 1 }`. A field without a `rollup` can only be shown at the source granularity.
- A semantic warning: rolling daily active users up to a month with `avg` gives you *average daily active users*, not *monthly active users*. Say so in the field's `description` and flag it to readers with `note`.
- Adapting to messy data: `sourceColumn` (read by physical column index — use it for every field once you use it for one), `numberFormat: "comma-grouped"` (accepts `12,345.67`), `skipBlankRows` (skip rows where every non-time field is empty).
- Size limits: manifest ≤ 256 KB, data file ≤ 20 MB, 250,000 rows.

**Time alignment — the most common source of errors**

- The time field must be a complete `YYYY-MM-DD` landing on the start of a source period: the 1st for a monthly source, the first day of a calendar quarter for a quarterly source, and whichever day `weekStartsOn` declares for a weekly source.
- Validation happens at load time and covers every row in the file. Narrowing `from` / `to` does not skip past offending rows outside the range.
- Granularity rolls up, never down: a daily source can produce day / week / month / quarter, a weekly source week and coarser, a monthly source month and quarter.
- In chart mode, any granularity producing more than 120 buckets is dropped by the density filter, which keeps unreadably dense charts off the page.

---

## Troubleshooting

- **The source shows up where a chart should be.** The paragraph contains something besides the tag (not taken over — expected behaviour), or the tag is not correctly self-closed.
- **A red error box.** Read the message: manifest or data file not found (check whether the path is relative to the note or to the manifest), a date not aligned to a period start (the row number is included), an undeclared field, or a granularity outside `granularityOptions`.
- **A series is missing.** The manifest does not compute anything — a total column that is not in the source data cannot be drawn. If you need a total, add the column to the data file.
- **The same data needs two different definitions.** One manifest carries one set of roll-ups. Write one manifest for the sum and one for the average, both with `data` pointing at the same file.
- **A literal `/>` inside an attribute value** truncates the tag early — a safe refusal that renders the source instead.
- **The footnote says an incomplete boundary period was omitted.** The range endpoint does not cover a whole period; this is normal. Move the endpoint to a period boundary to make it go away.

---

## Planned

- Live Preview rendering.
