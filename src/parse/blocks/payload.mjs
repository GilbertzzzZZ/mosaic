// Payload helpers shared by the five plain component blocks: fenced-block and
// row extraction, cell/attribute coercion, and status/type normalization —
// all pure functions over the raw tag body.
// parseRichBlocks/parseInlineText return structured data rather than HTML
// strings, so nothing here escapes or builds markup: that is the view layer's
// job.

import { parseDelimitedRecords } from "../delimited-data.mjs";

/**
 * Detects a single fenced code block spanning the entire content (allowing
 * surrounding whitespace). Returns null for "bare" content (no fence, or
 * trailing text after the closing fence).
 */
export function extractDataBlock(content) {
	const match = content.match(/^\s*```([A-Za-z0-9_-]+)?[^\n]*\r?\n([\s\S]*?)\r?\n```\s*$/);
	if (!match) return null;
	return {
		format: (match[1] || "csv").toLowerCase(),
		body: match[2],
	};
}

/**
 * Shared row extraction used by DataTable/Timeline/DecisionBox/MetricGrid.
 * Fenced json/tsv change the parse path; any other language tag (including
 * a missing one) degrades to CSV. Bare content is sniffed: leading `[`/`{`
 * is JSON, containing `|` is a markdown table, otherwise CSV.
 *
 * `@returns` is declared rather than inferred: the JSON branch runs through
 * JSON.parse, so inference collapses the whole function to `any` and the
 * consuming views lose every check. The declared element type is the block
 * system's Row contract — the CSV/TSV/Markdown branches guarantee it via
 * parseCell(), while the JSON branch passes parsed values straight through,
 * so a JSON payload carrying booleans/objects reaches the views as declared
 * string|number cells.
 *
 * @param {string} content
 * @returns {Record<string, string | number>[]}
 */
export function extractRows(content) {
	const dataBlock = extractDataBlock(content);
	if (dataBlock) {
		if (dataBlock.format === "json") {
			return rowsFromJson(dataBlock.body);
		}
		if (dataBlock.format === "tsv") {
			return rowsFromDelimited(dataBlock.body, "\t");
		}
		return rowsFromDelimited(dataBlock.body, ",");
	}

	const trimmed = content.trim();
	if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
		return rowsFromJson(trimmed);
	}
	if (trimmed.includes("|")) {
		return rowsFromMarkdownTable(trimmed);
	}
	return rowsFromDelimited(trimmed, ",");
}

function rowsFromJson(content) {
	const parsed = JSON.parse(content);
	const rows = Array.isArray(parsed) ? parsed : parsed.rows;
	if (!Array.isArray(rows)) return [];
	return rows.filter((row) => row && typeof row === "object");
}

function rowsFromDelimited(content, delimiter) {
	const records = parseDelimitedRecords(content.trim(), delimiter);
	if (records.length < 2) return [];
	const headers = records[0].map((header) => String(header).trim());
	return records
		.slice(1)
		.filter((record) => record.some((value) => String(value).trim() !== ""))
		.map((record) => Object.fromEntries(headers.map((header, index) => [header, parseCell(record[index] ?? "")])));
}

function rowsFromMarkdownTable(content) {
	const lines = content.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
	if (lines.length < 3) return [];
	const headers = splitMarkdownRow(lines[0]);
	return lines.slice(2).map((line) => {
		const cells = splitMarkdownRow(line);
		return Object.fromEntries(headers.map((header, index) => [header, parseCell(cells[index] ?? "")]));
	});
}

function splitMarkdownRow(line) {
	return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

/** Strict numeric sniff: only a bare integer or decimal becomes a number. */
export function parseCell(value) {
	const text = String(value).trim();
	if (text === "") return "";
	const number = Number(text);
	return Number.isFinite(number) && /^-?\d+(?:\.\d+)?$/.test(text) ? number : text;
}

/**
 * Comma-separated attribute value → trimmed, non-empty string list.
 * @param {string | undefined} value
 * @returns {string[]}
 */
export function listAttribute(value) {
	if (!value) return [];
	return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

/**
 * Dedupe a list of values as trimmed, non-empty strings (order preserved).
 * @param {unknown[]} values
 * @returns {string[]}
 */
export function uniqueStrings(values) {
	return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

/** Timeline status bucket. */
export function normalizeStatus(value) {
	const status = String(value || "default").trim().toLowerCase();
	if (["done", "complete", "completed", "success"].includes(status)) return "done";
	if (["blocked", "risk", "warning"].includes(status)) return "blocked";
	if (["active", "doing", "progress", "in-progress"].includes(status)) return "active";
	return "default";
}

/** DecisionBox status bucket. Empty/unset stays "" (no badge rendered). */
export function normalizeDecisionStatus(value) {
	const status = String(value || "").trim().toLowerCase();
	if (["accepted", "proposed", "rejected", "superseded"].includes(status)) return status;
	if (["done", "complete", "completed"].includes(status)) return "accepted";
	return status ? "default" : "";
}

/** MetricGrid status bucket, with +/- prefix fallback for delta-driven color. */
export function normalizeMetricStatus(value) {
	const status = String(value || "").trim().toLowerCase();
	if (["good", "up", "positive", "success", "active"].includes(status)) return "good";
	if (["risk", "warning", "blocked", "down", "negative"].includes(status)) return "risk";
	if (["watch", "flat", "neutral"].includes(status)) return "watch";
	if (/^\+/.test(status)) return "good";
	if (/^-/.test(status)) return "risk";
	return "neutral";
}

/** FlowDiagram node type bucket. */
export function normalizeFlowType(value) {
	const type = String(value || "action").trim().toLowerCase();
	if (["start", "end", "decision", "gate", "risk", "action"].includes(type)) return type;
	if (["warning", "blocked", "error"].includes(type)) return "risk";
	if (["question", "branch", "condition"].includes(type)) return "decision";
	return "action";
}

/**
 * Strips a fenced block only when its language tag is one of the "plain
 * text" aliases; any other language tag (or no fence at all) leaves
 * content untouched, fence markers included.
 */
function stripTextFence(content) {
	const dataBlock = extractDataBlock(content);
	if (!dataBlock) return content;
	if (["md", "markdown", "text", "txt"].includes(dataBlock.format)) {
		return dataBlock.body;
	}
	return content;
}

/**
 * Parsing half of renderRichBlock(): minimal paragraph/bullet-list block
 * splitter (DecisionBox's rich-text fallback). No headings, ordered lists,
 * blockquotes, or nested lists. Blank lines flush the current paragraph
 * and/or list. Returns structured blocks instead of HTML strings — each
 * block's `lines` are the raw (untrimmed-of-inline-markup) source lines,
 * to be joined with a space (paragraph) or rendered one <li> per line
 * (list) by the view layer, after running parseInlineText on the text.
 *
 * `@returns` is declared rather than inferred: `blocks` is an evolving `[]`,
 * which infers as `any[]` and gives the view layer nothing to check.
 *
 * @param {string} content
 * @returns {{type: "p" | "ul", lines: string[]}[]}
 */
export function parseRichBlocks(content) {
	const stripped = stripTextFence(content).trim();
	if (!stripped) return [];

	const blocks = [];
	let paragraph = [];
	let list = [];
	const flushParagraph = () => {
		if (paragraph.length === 0) return;
		blocks.push({ type: "p", lines: paragraph });
		paragraph = [];
	};
	const flushList = () => {
		if (list.length === 0) return;
		blocks.push({ type: "ul", lines: list });
		list = [];
	};

	for (const rawLine of stripped.split(/\r?\n/)) {
		const line = rawLine.trim();
		const bullet = line.match(/^[-*]\s+(.+)$/);
		if (!line) {
			flushParagraph();
			flushList();
			continue;
		}
		if (bullet) {
			flushParagraph();
			list.push(bullet[1]);
			continue;
		}
		flushList();
		paragraph.push(line);
	}

	flushParagraph();
	flushList();
	return blocks;
}

/**
 * Parsing half of renderInlineText(): lexes `code` spans and **bold**
 * spans into a flat token stream (no HTML escaping — the view layer owns
 * that). Code spans are extracted first (matching renderInlineText's
 * backtick-before-bold replacement order), then bold spans are found
 * within the remaining plain-text segments.
 *
 * Token `type` is one of "text" | "code" | "bold"; the return type is left to
 * inference (which widens `type` to string) so that renaming a token field
 * still breaks the view layer at compile time.
 *
 * @param {unknown} text
 */
export function parseInlineText(text) {
	const raw = String(text ?? "");
	if (raw === "") return [];

	const tokens = [];
	const codeRe = /`([^`]+)`/g;
	let lastIndex = 0;
	let match;
	const segments = [];
	while ((match = codeRe.exec(raw)) !== null) {
		if (match.index > lastIndex) segments.push({ type: "text", text: raw.slice(lastIndex, match.index) });
		segments.push({ type: "code", text: match[1] });
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < raw.length) segments.push({ type: "text", text: raw.slice(lastIndex) });

	for (const segment of segments) {
		if (segment.type === "code") {
			tokens.push(segment);
			continue;
		}
		const boldRe = /\*\*([^*]+)\*\*/g;
		let boldLastIndex = 0;
		let boldMatch;
		while ((boldMatch = boldRe.exec(segment.text)) !== null) {
			if (boldMatch.index > boldLastIndex) {
				tokens.push({ type: "text", text: segment.text.slice(boldLastIndex, boldMatch.index) });
			}
			tokens.push({ type: "bold", text: boldMatch[1] });
			boldLastIndex = boldMatch.index + boldMatch[0].length;
		}
		if (boldLastIndex < segment.text.length) {
			tokens.push({ type: "text", text: segment.text.slice(boldLastIndex) });
		}
	}

	return tokens;
}

/**
 * Timeline row → normalized item (§3.3 alias chain, renderTimelineItem).
 * All five fields are produced unconditionally: `status` is bucketed by
 * normalizeStatus(), the other four fall back to "" when no alias matches.
 * The return type is left to inference so that renaming a field here breaks
 * TimelineView at compile time.
 *
 * @param {Record<string, string | number>} row
 */
export function timelineItem(row) {
	return {
		status: normalizeStatus(row.status),
		date: row.date ?? row.time ?? row.month ?? "",
		title: row.title ?? row.name ?? row.event ?? "",
		body: row.body ?? row.description ?? row.summary ?? row.note ?? "",
		owner: row.owner ?? row.assignee ?? "",
	};
}

/**
 * MetricGrid row → normalized item (§5.3 alias chain, renderMetricGrid).
 * All five fields are produced unconditionally: `status` is bucketed by
 * normalizeMetricStatus(), the other four fall back to "" when no alias
 * matches. The return type is left to inference so that renaming a field
 * here breaks MetricGridView at compile time.
 *
 * @param {Record<string, string | number>} row
 */
export function metricItem(row) {
	return {
		label: row.label ?? row.metric ?? row.name ?? row.title ?? "",
		value: row.value ?? row.current ?? row.amount ?? row.count ?? "",
		delta: row.delta ?? row.change ?? row.mom ?? row.yoy ?? "",
		note: row.note ?? row.description ?? row.source ?? row.body ?? "",
		status: normalizeMetricStatus(row.status ?? row.trend ?? row.delta ?? row.change),
	};
}

/**
 * DecisionBox path A: structured label/value rows (§4.3 alias chain,
 * renderDecisionBox). Rows where both label and value are empty are
 * dropped — an empty result signals the caller to fall back to
 * parseRichBlocks() on the raw content instead.
 *
 * Both fields are produced unconditionally (falling back to "" when no alias
 * matches); the return type is left to inference so that renaming a field
 * here breaks DecisionBoxView at compile time.
 *
 * @param {Record<string, string | number>[]} rows
 */
export function decisionItems(rows) {
	return rows
		.map((row) => ({
			label: row.label ?? row.key ?? row.name ?? row.item ?? "",
			value: row.value ?? row.text ?? row.body ?? row.description ?? row.summary ?? "",
		}))
		.filter((item) => item.label || item.value);
}
