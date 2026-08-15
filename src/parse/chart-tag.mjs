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
// 属性名必须从行首或空白之后起头（第 1 组），否则 `零售业务Label="x"` 会被从中间
// 切开、错认成一个没人写过的 `Label` 属性。左边界写成捕获组而不是 lookbehind：
// esbuild target 是 es2017（< es2018），会把带 lookbehind 的字面量降级成
// `new RegExp("…")`，把语法问题推迟到运行时；捕获组在任何 target 上原样保留。
// 字符集仍是 ASCII——中文属性名不支持，且必须被整体判定为不认识。
const ATTR =
	/(^|\s)([A-Za-z_][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;
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
	const attributes = parseAttrs(inner, true);
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
	const attributes = parseAttrs(inner, false);
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

// 扫描 inner，一遍同时产出「认出的属性表」与「未归属的剩余文本」。剩余文本按
// 匹配区间 [match.index + 左边界空白长度, ATTR.lastIndex) 原地切除得到——不能用
// `remainder.replace(attr[0], "")`：字符串参数只替换第一处，同一段 `attr=value`
// 文本在别处重复出现时会剥错位置，剩余片段就不再是原文的忠实切片。
// 属性表是动态键的字符串字典，推断只能得到空对象类型 `{}`，因此显式声明——
// 没有固定字段名，声明不会掩盖任何改名。
// 导出仅供解析层测试直接观察这两个产物（`parseAttrs` 只回传前者或 null）。
/**
 * @param {string} inner
 * @returns {{ attributes: Record<string, string>, remainder: string }}
 */
export function scanAttrs(inner) {
	/** @type {Record<string, string>} */
	const attributes = {};
	let remainder = "";
	let cursor = 0;
	ATTR.lastIndex = 0;
	let attr;
	while ((attr = ATTR.exec(inner))) {
		const from = attr.index + attr[1].length; // 越过左边界捕获的那段空白
		remainder += inner.slice(cursor, from);
		cursor = ATTR.lastIndex;
		attributes[attr[2]] = attr[3] ?? attr[4] ?? attr[5] ?? "";
	}
	remainder += inner.slice(cursor);
	return { attributes, remainder };
}

// 未归属片段挂在属性表上的私有键。取 symbol 且不可枚举，是因为属性表在下游被当作
// 纯粹的 Record<string, string> 消费——queryDataset 用展开运算符拼 renderAttributes、
// 组合图用 Object.keys 判 lines/bars 书写顺序——多一个可枚举的字符串键就会渗进那些
// 地方。symbol 只有本模块拿得到，外面统一走 applyFieldNotice()。
// 挂在属性表上而不是标签对象上，是因为属性表是唯一贯穿「解析 → 渲染」的那个引用：
// 入口把 tag.attributes 原样交给渲染层，中途不复制。
const UNRECOGNIZED = Symbol("mosaic.unrecognizedText");

// 体量判据的倍数：未归属片段总长超过已解析属性文本总长的这个倍数时，整块退回。
// 计划原稿写的是 1 倍。实测否决——测试库 cases/08-host-rules.mdx 那条真实笔记写法
// （真实笔记库 的 2026-06-financial-report.mdx 原样搬来的）量出来是：已解析 69 字符
// （title/type/x/series/unit 五条），未归属 76 字符（四条中文属性名）。1 倍会把用户
// 指名要出图的那张图整块退回，正好与这一项的目的相反。
// 根因是这条判据对「合法但一半字段不认识」的标签天生不适用：中文字段名在字符数上
// 与 ASCII 属性同量级，四条不认识就足以压过五条认识的。取 2 倍留出一档余量——真正
// 要挡的是「大段散文里混着一个属性」（散文长度是属性文本的几十倍），2 倍与几十倍
// 之间有的是空隙。挡开标签越界那件事另有更准的两条：inner 含 "<"、未归属文本含 ">"。
const STRAY_BUDGET = 2;

// 尽力解析：inner 里认不出的片段不再让整块作废，而是收集起来交给渲染层挂提示
// （用户决定：优先出图 + 底部报错，出不了图才是全面报错）。
// 但那道旧闸门同时在挡「误把普通段落当标签」，放宽后要用另外三条判据补上：
//   1. inner 含 "<"          —— 保留。matchSelfClosing 用 indexOf("/>") 找第一个 "/>",
//                               可能跨到另一个标签里去，跨过去就会带上别人的 "<"。
//   2. 未归属文本含 ">"      —— 只对自闭合成立。合法自闭合标签的 inner 里，">" 只可能
//                               出现在引号内（裸值的字符集本就排除了 ">"），而引号内的
//                               会被当作属性值消费掉；它出现在未归属文本里，说明
//                               indexOf("/>") 已经越过了本标签的开标签终止符。
//                               成对标签的 ">" 由引号感知扫描定位，本身可靠，不加这条。
//   3. 体量判据              —— 未归属片段明显多于已解析属性文本时判为边界误判，仍然
//                               整块退回。宁可不认，也不要画出一个面目全非的东西。
// 三条都不触发时返回属性表；认不出的片段挂上 UNRECOGNIZED，渲染层据此出提示。
/**
 * @param {string} inner
 * @param {boolean} selfClosing
 * @returns {Record<string, string> | null}
 */
function parseAttrs(inner, selfClosing) {
	if (inner.includes("<")) return null;
	const { attributes, remainder } = scanAttrs(inner);
	// 按空白切片：remainder 是原文的忠实切片，切出来的每一片就是用户写下的那一整条
	// （`零售业务Label="零售业务"` 整条，而不是光秃秃的 `零售业务`）。值里带空格的
	// 片段会被切成两片——提示里字符不丢，只是分了行，不值得为此再写一个引号扫描器。
	const stray = remainder.split(/\s+/).filter(Boolean);
	if (stray.length === 0) return attributes;
	if (selfClosing && remainder.includes(">")) return null;
	// 已解析属性文本总长 = inner 减去未归属文本（含标签内的全部空白与换行）。
	// 未归属片段总长不计空白：多行标签的空白量与写法有关，计进来会让判据随排版摇摆。
	const strayLength = stray.reduce((total, piece) => total + piece.length, 0);
	if (strayLength > STRAY_BUDGET * (inner.length - remainder.length)) return null;
	Object.defineProperty(attributes, UNRECOGNIZED, { value: stray });
	return attributes;
}

// 插件认得的 Chart 属性名。**清单取自代码里的属性消费点，不是文档**：
//   src/render/chart-tag-config.mjs —— 出图配置读的那 15 个（含 highlight / labels）
//   src/parse/dataset-query.mjs     —— 外部数据集模式下选字段读的那些
//   src/render/render-chart.tsx     —— title / note / dataset
// tests/chart-tag.test.mjs 有一条漂移守卫：把 chart-tag-config.mjs 里所有
// attrs.X / attributes.X 抓出来比对这个集合。新增属性忘了加进来，那条测试会红——
// 否则每张用了新属性的图都会挂一条假提示。
const CHART_ATTRIBUTES = new Set([
	"title",
	"note",
	"dataset",
	"type",
	"x",
	"series",
	"y",
	"bars",
	"bar",
	"lines",
	"line",
	// 四组别名只被 dataset-query 的字段选择读到（挑哪几列进查询结果），
	// 出图时的角色划分仍看 bars/lines。
	"leftSeries",
	"left",
	"leftAxis",
	"leftY",
	"rightSeries",
	"right",
	"rightAxis",
	"rightY",
	"unit",
	"leftUnit",
	"rightUnit",
	"labels",
	"highlight",
	"from",
	"to",
	"granularity",
	"granularityOptions",
]);
// 按 CSV 列名 / 数据集字段名派生的动态键：`零售业务Label`、`revenueColor` 之类都是
// 正常配置，不能报成未知。前缀必须非空——Task 12 之前的正则会凭空造出光秃秃的
// `Label` / `Color`，那个才是真该被点名的。
const DERIVED_ATTRIBUTE = /^.+(?:Label|Color)$/;

// 把「没认出来的字段」写进 built.warning，走 ChartFigure 已有的局部提示通道
// （.mosaic-figure-warning，橙色左边线），与「类型写错」那条提示同源、同样式。
// 就地改写而不是返回新对象：built 每次由 build() 新造，与 withTheme() 同一口径。
/**
 * @param {{ warning?: string }} built
 * @param {Record<string, string>} attributes
 */
export function applyFieldNotice(built, attributes) {
	const parts = [];
	const stray = attributes[UNRECOGNIZED];
	if (stray?.length) {
		parts.push(
			`Unrecognized tag text: ${stray.join(", ")} — ignored` +
				` (attribute names must be ASCII letters, digits, "_" or "-").`,
		);
	}
	const unknown = Object.keys(attributes).filter(
		(name) => !CHART_ATTRIBUTES.has(name) && !DERIVED_ATTRIBUTE.test(name),
	);
	if (unknown.length > 0) {
		parts.push(`Unknown chart attributes: ${unknown.join(", ")} — ignored.`);
	}
	if (parts.length === 0) return;
	built.warning = [built.warning, ...parts].filter(Boolean).join("; ");
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
