// src/dataset/chart-tag.mjs
const OPEN_TAG = /<Chart(?=[\s/>])/g;
const ATTR = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"/g;
const PAIRED_BODY = /^\s*```(?:csv)?[ \t]*\n([\s\S]*?)\n```[ \t]*\s*$/;

export function findChartTags(text) {
	const source = String(text ?? "");
	const tags = [];
	OPEN_TAG.lastIndex = 0;
	let match;
	while ((match = OPEN_TAG.exec(source))) {
		const tag =
			matchSelfClosing(source, match.index) ?? matchPaired(source, match.index);
		if (!tag) continue; // 畸形候选：regex lastIndex 已越过 "<Chart"，不会死循环
		tags.push(tag);
		OPEN_TAG.lastIndex = tag.end;
	}
	return tags;
}

// 自闭合：<Chart ... />。语义与改造前完全一致（含属性值内不得含字面 "/>" 的既有限制）。
function matchSelfClosing(source, start) {
	const close = source.indexOf("/>", start);
	if (close === -1) return null;
	const inner = source.slice(start + "<Chart".length, close);
	const attributes = parseAttrs(inner);
	if (!attributes) return null;
	return { start, end: close + 2, attributes, csv: null };
}

// 成对：<Chart ...> + ```csv fence + </Chart>。开标签的 ">" 用引号感知扫描定位，
// 属性值里允许出现 ">"。
function matchPaired(source, start) {
	let i = start + "<Chart".length;
	let quoted = false;
	for (; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === '"') quoted = !quoted;
		else if (!quoted && ch === ">") break;
		else if (!quoted && ch === "<") return null; // 嵌套/畸形
	}
	if (i >= source.length) return null;
	const inner = source.slice(start + "<Chart".length, i);
	if (inner.trimEnd().endsWith("/")) return null; // 自闭合已在前一分支处理失败，弃
	const attributes = parseAttrs(inner);
	if (!attributes) return null;
	const closeIdx = source.indexOf("</Chart>", i + 1);
	if (closeIdx === -1) return null;
	const body = source.slice(i + 1, closeIdx);
	const m = PAIRED_BODY.exec(body);
	if (!m) return null;
	return {
		start,
		end: closeIdx + "</Chart>".length,
		attributes,
		csv: m[1],
	};
}

// inner 仅由 attr="value" 对和空白组成时返回属性表，否则 null。
function parseAttrs(inner) {
	if (inner.includes("<")) return null;
	let remainder = inner;
	ATTR.lastIndex = 0;
	let attr;
	while ((attr = ATTR.exec(inner))) {
		remainder = remainder.replace(attr[0], "");
	}
	if (remainder.trim().length !== 0) return null;
	const attributes = {};
	ATTR.lastIndex = 0;
	while ((attr = ATTR.exec(inner))) attributes[attr[1]] = attr[2];
	return attributes;
}

export function isOnlyChartTags(text, tags) {
	if (tags.length === 0) return false;
	let rest = "";
	let cursor = 0;
	for (const tag of tags) {
		rest += text.slice(cursor, tag.start);
		cursor = tag.end;
	}
	rest += text.slice(cursor);
	return rest.trim().length === 0;
}
