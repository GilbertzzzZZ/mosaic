// src/parse/chart-tag.mjs
// COMPONENT_NAMES 是六类内容块标签名的唯一权威清单：OPEN_TAG 与入口的
// FAST_PATH 均由它构造，新增内容块只改这里（渲染映射见 render-component）。
export const COMPONENT_NAMES = [
	"DataTable",
	"Timeline",
	"Chart",
	"DecisionBox",
	"MetricGrid",
	"FlowDiagram",
];

const OPEN_TAG = new RegExp(`<(${COMPONENT_NAMES.join("|")})(?=[\\s/>])`, "g");
const ATTR = /([A-Za-z_][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
const PAIRED_BODY = /^\s*```(?:csv)?[ \t]*\n([\s\S]*?)\n```[ \t]*\s*$/;

// 六名字通用识别：自闭合/成对标签边界 + 属性解析。body 原文透传，不做 fence 校验
// （fence/payload 校验是解析层各消费方的职责，见 findChartTags 的兼容 wrapper）。
// 每个标签无条件产出 name/start/end/attributes/body 五个字段（自闭合标签的 body
// 为 null）；返回类型交给推断，改字段名时 chart-tag-processor 会编译期报错。
/**
 * @param {string} text
 */
export function findComponentTags(text) {
	const source = String(text ?? "");
	const tags = [];
	OPEN_TAG.lastIndex = 0;
	let match;
	while ((match = OPEN_TAG.exec(source))) {
		const name = match[1];
		const tag =
			matchSelfClosing(source, match.index, name) ??
			matchPaired(source, match.index, name);
		if (!tag) continue; // 畸形候选：regex lastIndex 已越过 "<Name"，不会死循环
		tags.push(tag);
		OPEN_TAG.lastIndex = tag.end;
	}
	return tags;
}

// 自闭合：<Name ... />。语义与 Chart 专用版本完全一致（含属性值内不得含字面 "/>" 的既有限制）。
function matchSelfClosing(source, start, name) {
	const tagLen = 1 + name.length; // "<" + name
	const close = source.indexOf("/>", start);
	if (close === -1) return null;
	const inner = source.slice(start + tagLen, close);
	const attributes = parseAttrs(inner);
	if (!attributes) return null;
	return { name, start, end: close + 2, attributes, body: null };
}

// 成对：<Name ...> + body + </Name>。开标签的 ">" 用引号感知扫描定位，
// 属性值里允许出现 ">"。body 原文（开标签 ">" 之后到 "</Name>" 之前）不做校验，
// 交给消费方（如 findChartTags 的 PAIRED_BODY 校验）处理。
function matchPaired(source, start, name) {
	const tagLen = 1 + name.length;
	let i = start + tagLen;
	let quoted = false;
	for (; i < source.length; i += 1) {
		const ch = source[i];
		if (ch === '"') quoted = !quoted;
		else if (!quoted && ch === ">") break;
		else if (!quoted && ch === "<") return null; // 嵌套/畸形
	}
	if (i >= source.length) return null;
	const inner = source.slice(start + tagLen, i);
	if (inner.trimEnd().endsWith("/")) return null; // 自闭合已在前一分支处理失败，弃
	const attributes = parseAttrs(inner);
	if (!attributes) return null;
	const closeTag = `</${name}>`;
	const closeIdx = source.indexOf(closeTag, i + 1);
	if (closeIdx === -1) return null;
	const body = source.slice(i + 1, closeIdx);
	return {
		name,
		start,
		end: closeIdx + closeTag.length,
		attributes,
		body,
	};
}

// inner 仅由 attr=value 对（双引号/单引号/裸值三形态）和空白组成时返回属性表，否则 null。
// 属性表是动态键的字符串字典，推断只能得到空对象类型 `{}`，因此这里显式声明——
// 没有固定字段名，声明不会掩盖任何改名。
/**
 * @param {string} inner
 * @returns {Record<string, string> | null}
 */
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
	while ((attr = ATTR.exec(inner))) {
		attributes[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? "";
	}
	return attributes;
}

export function isOnlyComponentTags(text, tags) {
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


// 兼容导出：Chart-only 过滤 + 现有 PAIRED_BODY csv-fence 校验，语义与改造前逐字一致
// （非 csv fence 的成对候选照旧被丢弃，保证 Chart 渲染行为零变化）。
// 每个结果无条件产出 start/end/attributes/csv 四个字段（自闭合标签的 csv 为 null）；
// 返回类型交给推断，改字段名时 chart-tag-processor 会编译期报错。
/**
 * @param {string} text
 */
export function findChartTags(text) {
	const tags = findComponentTags(text).filter((tag) => tag.name === "Chart");
	const result = [];
	for (const tag of tags) {
		if (tag.body === null) {
			result.push({
				start: tag.start,
				end: tag.end,
				attributes: tag.attributes,
				csv: null,
			});
			continue;
		}
		const m = PAIRED_BODY.exec(tag.body);
		if (!m) continue; // fence 不匹配：按现状规则丢弃该候选
		result.push({
			start: tag.start,
			end: tag.end,
			attributes: tag.attributes,
			csv: m[1],
		});
	}
	return result;
}
