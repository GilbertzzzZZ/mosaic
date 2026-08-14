// Ported from git-leaf (https://github.com/MangoFuture1210/git-leaf)
// src/content/mdx-lite.mjs (datasetQueryFromContent, lines 221-239), Apache-2.0.
// See NOTICE. Local changes: none.

import { extractDataBlock } from "./payload.mjs";

// DataTable dataset mode is mutually exclusive with inline payload: once a
// component carries a `dataset` attribute, its body may only hold an optional
// fenced ```query JSON object with `from`/`to`/`where` keys (validated by the
// caller/queryDataset, not here). Empty body (including self-closing tags)
// is equivalent to an empty query.
export function datasetQueryFromContent(content) {
	if (!String(content ?? "").trim()) return {};
	const dataBlock = extractDataBlock(content);
	if (!dataBlock || dataBlock.format !== "query") {
		throw new Error(
			"A dataset component body may contain only a fenced query JSON object.",
		);
	}
	let query;
	try {
		query = JSON.parse(dataBlock.body);
	} catch {
		throw new Error("Dataset query must contain valid JSON.");
	}
	if (!query || typeof query !== "object" || Array.isArray(query)) {
		throw new Error("Dataset query must be a JSON object.");
	}
	return query;
}
