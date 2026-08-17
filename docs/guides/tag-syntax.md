# Tag syntax

*[中文版](tag-syntax-zh.md)*

> Rules shared by all six tag entries (Chart / DataTable / MetricGrid / Timeline / DecisionBox / FlowDiagram): how the host splits paragraphs, attribute syntax, tag-body boundaries, the common row-extraction paths, and the cases that fall back to rendering the source as-is.
> This page covers only what is identical across blocks. Per-block attribute tables, field contracts and quirks live in each block's own guide; the design rationale is in [architecture.md](../design/architecture.md).

## How the host splits paragraphs

- A tag is only taken over when the paragraph contains **nothing but tags and whitespace**. Mix anything else into the paragraph and the whole thing renders as plain Markdown — not an error, just untouched.
- Several tags in one paragraph each render on their own and fail on their own. One broken tag never affects the rest of the page.

## Writing boundaries

- **The opening tag must fit on one line.** Only a complete opening tag alone on its line triggers Obsidian's HTML-block rule, which hands the tag body — fences included — to the plugin. Break the opening tag across lines and Obsidian treats it as an ordinary paragraph: the tag is not taken over and renders as source. This is the host's paragraph-splitting rule, not a plugin limitation, and multi-line opening tags cannot be supported.
- **No blank lines inside the tag body.** A blank line between the opening and closing tag ends the HTML block early; everything after it — fences and closing tag included — is parsed as separate paragraphs, and again the tag is not taken over.
- **Three quoting forms for attribute values.** Double quotes, single quotes and no quotes are all valid (`title="Example"`, `title='Example'`, `title=Example`). Unquoted values may not contain whitespace, quotes, `>` or `/`.
- **Spaces around `=` cost you the attribute but not the tag.** In `title = "Example"`, the `title`, the `=` and the `"Example"` are split into three unrecognized fragments. The chart or table **still renders** (just without a title) and all three fragments are listed verbatim in the notice bar underneath. CommonMark allows whitespace between an attribute name and its `=`, so the host lets it through and Mosaic cannot intercept it.
- **Attribute names must be ASCII** (`[A-Za-z_][A-Za-z0-9_-]*`). Write `营收Label="Revenue"` or `CaféLabel="Café"` and **the entire tag is not taken over** — the paragraph renders as source. The cause is again the host: HTML attribute names may not contain non-ASCII characters, so the opening tag never qualifies at the CommonMark stage, and the opening tag, fence and closing tag are split into three separate paragraphs. The plugin never sees a complete tag. If you need non-ASCII attribute names, use the code-block form — its frontmatter has no such restriction.
- **The closing tag needs its own line**, spelled exactly like the opening one and case-sensitive (for example `</DataTable>`).

Attribute syntax (quoting forms, the `=` rule) applies to self-closing and paired tags alike. The tag-body rules (single-line opening tag, no blank lines, closing tag) constrain paired tags only.

## The four row-extraction paths

Inline payloads for DataTable / MetricGrid / Timeline / DecisionBox / FlowDiagram share one set of extraction rules, tried in order. (Chart's paired-tag body accepts only a CSV fence and does not use these rules — see [chart.md](chart.md).)

1. The body is a single fenced code block (` ```json ` / ` ```tsv ` / ` ```csv ` or no language tag at all): `json` is parsed as JSON (either an array of rows, or a `{"rows":[...]}` object); `tsv` is split on tabs; **every other language tag — typos, `csv`, no tag, even something unrelated — falls back to comma-separated CSV.** The language tag only really matters when it is `json` or `tsv`.
2. No fence, and the bare text starts with `[` or `{`: the whole body is parsed as JSON.
3. No fence, and the bare text contains a `|`: parsed as a Markdown table (line 1 is the header, line 2 is the separator and is skipped unconditionally without format checking, data starts on line 3).
4. Fallback: the bare text is parsed as comma-separated CSV.

Every extracted row is a flat object whose field names are the column headers (CSV / TSV / Markdown table) or the JSON keys. After extraction each block applies its own field-alias normalisation — or none at all, as with DataTable. See the payload contract in each guide.

**Malformed JSON.** When a `json` fence (or bare JSON) is invalid, the native JSON parse error is surfaced directly in a red error box; the wording varies with the exact failure position. This path behaves identically for all five blocks.

## When the source renders as-is

In the following cases the tag is not taken over and the paragraph renders as plain Markdown — no error box. This is identical for every paired-tag block:

- The opening tag spans multiple lines (see writing boundaries above).
- A blank line appears inside the tag body.
- The paragraph contains something other than tags.
- No closing tag is found on a line of its own.

## Related

- [chart.md](chart.md) · [data-table.md](data-table.md) · [metric-grid.md](metric-grid.md) · [timeline.md](timeline.md) · [decision-box.md](decision-box.md) · [flow-diagram.md](flow-diagram.md) — per-block attribute tables, contracts and quirks
- [architecture.md](../design/architecture.md) — why entry recognition and error handling work this way
