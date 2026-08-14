// src/dataset/chart-tag.mjs
const OPEN_TAG = /<Chart(?=[\s/>])/g;
const ATTR = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*"([^"]*)"/g;

export function findChartTags(text) {
	const source = String(text ?? "");
	const tags = [];
	OPEN_TAG.lastIndex = 0;
	let match;
	while ((match = OPEN_TAG.exec(source))) {
		const close = source.indexOf("/>", match.index);
		if (close === -1) break;
		const inner = source.slice(match.index + "<Chart".length, close);
		if (inner.includes("<")) continue; // 畸形/嵌套，放弃该匹配

		// 验证 inner 仅由属性对和空白组成
		let remainder = inner;
		ATTR.lastIndex = 0;
		let attr;
		while ((attr = ATTR.exec(inner))) {
			remainder = remainder.replace(attr[0], "");
		}
		if (remainder.trim().length !== 0) continue; // inner 含非属性内容，放弃该匹配

		const attributes = {};
		ATTR.lastIndex = 0;
		while ((attr = ATTR.exec(inner))) attributes[attr[1]] = attr[2];
		tags.push({ start: match.index, end: close + 2, attributes });
		OPEN_TAG.lastIndex = close + 2;
	}
	return tags;
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
