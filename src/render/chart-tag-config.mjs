import { wilkinsonExtended } from "@antv/scale";
import { queryDataset } from "../parse/dataset-query.mjs";
import {
	DATASET_GRANULARITIES,
	isDatasetGranularity,
} from "../parse/dataset-granularity.mjs";
import { parseDelimitedRecords } from "../parse/delimited-data.mjs";

const CHART_COLORS = [
	"#2563eb",
	"#dc2626",
	"#16a34a",
	"#d97706",
	"#7c3aed",
	"#0891b2",
];
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LABELS_OFF = new Set([
	"0",
	"false",
	"hide",
	"hidden",
	"no",
	"none",
	"off",
]);
const CHART_TYPES = new Set([
	"line",
	"bar",
	"grouped-bar",
	"stacked-bar",
	"combo",
	"combo-dual-axis",
]);
const CHART_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 2,
});
// 折线数据点：实心圆、半径 3、无描边。半径走 style.r——mark 上的 size 不是
// G2 v5 的配置项；shapeField 选实心圆，point mark 的默认形状是空心的。
const LINE_POINT = { shapeField: "circle", style: { r: 3, lineWidth: 0 } };
// 折线线宽：v5 的主题默认给 1，比升级前细了一半（v4 主题给 2），折线在图里退成
// 了一根发丝。显式设回 2。style 不在 plots 的 EXTENDED_PROPERTIES 里，不会渗进
// point 简写生成的子 mark，数据点半径不受影响。
const LINE_STROKE = { lineWidth: 2 };
// 图例标记统一为方块（默认时折线是短线、柱状是方块，混图不统一）。
const LEGEND = { color: { itemMarker: "square" } };
// 数值标签防碰撞：先把越界标签平移回绘图区（首尾数据点贴着边缘，缺这步会被
// 下一步整个隐藏），再隐藏仍然重叠的。
const LABEL_TRANSFORM = [
	{ type: "exceedAdjust", bounds: "main" },
	{ type: "overlapHide" },
];
// 上面那组是组级的：runtime 按 label 分组、逐组去重叠，所以柱标签和折线标签互相看
// 不见——双轴图上「$ 123,800」和「4%」几乎贴在一起却都留着。这一份跑在视图级，对全
// 视图的标签一次性去重叠，是升级前没有的能力。单视图图表只有一个 mark，配了等价于
// 无害；真正吃到的是组合图和双轴图。
const VIEW_LABEL_TRANSFORM = [{ type: "overlapHide" }];
// 标签默认从锚点往下画：柱状图的锚点是柱顶，文字落进柱体内部；折线的锚点只有
// 一个点、位置处理器不给对齐方式，退回 G 的 start/alphabetic，文字落在点右侧。
// 改成往上画：文本框底边距锚点 4px，框底到数字底部还有约 4px 字体下伸空间，
// 合起来是图元上方约 8px 的空隙。
const LABEL_ABOVE = { textAlign: "center", textBaseline: "bottom", dy: -4 };
// 柱宽由 x band 比例尺的 padding 决定，默认 paddingInner/paddingOuter 都是 0.1
// （柱宽 = 槽宽的 0.9，柱子几乎相接）。paddingInner 0.5 把柱宽压回槽宽的一半，
// 配套的 paddingOuter 0.25 让首尾两槽与中间等宽、柱子仍居槽中央。折线图的 x
// 是 point 比例尺（bandWidth 恒为 0），不走这套。
const BAR_X_SCALE = { paddingInner: 0.5, paddingOuter: 0.25 };
// 分组柱的组内间距。group: true 走 v5 的 DodgeX，它的 padding 没有默认值，最后吃到
// 的是 series band scale 的 0.1，算出来「缝 / 柱宽 = 0.1/0.9 = 1/9」——是升级前
// （dodge 的 marginRatio = 1/32）的 32/9 ≈ 3.56 倍，同一组里的柱子看着不像一组。
// 1/33 是精确解：v5 的比值是 p/(1-p)，令它等于 1/32 即得，且「柱宽 / 子槽」的算式
// 与升级前代数恒等，与组内柱数无关。
// 顺带把组两端的外边距也带回 0：显式给了 paddingInner，G2 就不再注入 paddingOuter
// 默认值，Band 比例尺回落到 0——升级前的 dodge 同样不留组端边距。
// 只管组内。整组占槽宽的比例仍由 BAR_X_SCALE 决定，那是另一笔账。
const GROUP_DODGE = { padding: 1 / 33 };
// 悬停蒙层的配色挂在 mark 的 state.active 上——elementHighlight 从那里取 background
// 前缀的键喂给它的 renderBackground()。这里只留空壳，明暗色值由 chart-theme 在
// withTheme() 里注入，和网格线颜色走同一条路。
// 壳不能省：mergeState 生成的是按 mark key 分派的函数，mark 自己不带这组键时直接
// 回退到引擎默认值，注入无处可落。
const HOVER_BAND_STATE = { active: {} };
// 读数用的字号：数值标签与 tooltip 共用一档。图里其余文字（轴刻度、轴标题、图例）
// 都不设，仍走引擎主题的 12px——读数是图表要传达的那个东西，只把它抬起来。
// 标签光晕的宽度不跟着这个数走：两层画法里光晕是下层字形的描边，外扩量由 lineWidth
// 单独决定，与字号无关。只有单层描边才需要按笔画粗细算比例。
const VALUE_FONT_SIZE = 14;
// tooltip 不画在 canvas 上，是一个真的 DOM 元素，字号来自组件的默认样式表（12px）。
// 那张表是用 element.style.cssText += 写成**内联样式**的，styles.css 里的选择器不加
// !important 压不过它。interaction.tooltip.css 是引擎留的正规入口，会被 deepMix 进
// 同一张表，改出来仍是内联样式，优先级一致，也就不必动 !important。
const TOOLTIP_CSS = { ".g2-tooltip": { "font-size": `${VALUE_FONT_SIZE}px` } };
// 折线悬停时跟着鼠标走的那条竖线。引擎默认硬编码 1px、#1b1e23、0.5 不透明度，同样
// 不读主题：深色底上那个色叠出来几乎不可分辨。线宽对齐 LINE_STROKE 的 2，stroke 由
// chart-theme 注入。
// 只写不带 X/Y 的 crosshairs 前缀：subObject(style, 'crosshairs') 会把 crosshairsXxx
// 这种键剥成 xXxx 的垃圾键。真正画竖线的是 crosshairsY（updateRuleY），命名与直觉相反，
// 这里两条都不点名，样式对两条轴都生效。
// pointerEvents 是预防性的：crosshair 的 Line 没有像 marker 那样声明 pointerEvents,
// 加粗后它就是一个更宽的命中目标。line 现在只有 seriesTooltip（按鼠标坐标算，不看
// target）所以无影响，但将来给 line 加 elementHighlight 时粗线会挡住命中。
// 悬停蒙层的开关。region 决定触发范围：false（引擎默认）要鼠标压在柱体本身上，
// true 则按 x 就近查找，蒙层跟着鼠标在整个绘图区里走——这才是升级前 active-region
// 的语义（v5 没有同名交互，能力并进了 elementHighlight）。
// background 对 Column 是重复声明（plots 的默认选项里已有），对 DualAxes 不是：
// 那边的默认选项里根本没有 interaction 字段，组合图从来就没有过蒙层。
const HOVER_BAND_INTERACTION = { background: true, region: true };
// 组合图额外要关掉悬停竖线：line mark 自带 crosshairs: true，而 tooltip 的判定是
// .some()——视图里只要有一个 line mark，整个视图就切进 seriesTooltip 并画出竖线。
// 所以「蒙层变成一条线」不是配置被谁覆盖，是短路语义加上蒙层压根没开。
// 已否决的另一条路：interaction.tooltip.series = false。findSingleElement 只在全部
// mark 都是 interval 时才做 x 就近查找，混合 mark 会退回按 target 找，tooltip 变成
// 必须精确悬停在图元上才出，明显退步。
const COMBO_INTERACTION = {
	tooltip: { shared: true, crosshairs: false, css: TOOLTIP_CSS },
	elementHighlight: { ...HOVER_BAND_INTERACTION },
};
// 柱图：蒙层的触发范围 + tooltip 字号。
const BAR_INTERACTION = {
	tooltip: { css: TOOLTIP_CSS },
	elementHighlight: { ...HOVER_BAND_INTERACTION },
};
const CROSSHAIR_INTERACTION = {
	tooltip: {
		crosshairsLineWidth: 2,
		crosshairsStrokeOpacity: 0.25,
		crosshairsPointerEvents: "none",
		css: TOOLTIP_CSS,
	},
};

// plots 和 G2 会就地改写传进去的配置：label 被搬进 labels 数组、legend 上提、
// 顶层 scale 下发进每个 child、转换过的键随后被删掉。上面这些模块级常量只是模板，
// 直接放进配置就等于把它们借给渲染层去改——同一页的两张图、同一张图的两次重建，
// 都会拿到别人改过的那一份。取用时一律深拷贝。
// 函数按引用透传：函数不会被就地改写，拷贝反而会毁掉相等性判断。
function fresh(value) {
	if (Array.isArray(value)) return value.map(fresh);
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, inner]) => [key, fresh(inner)]),
	);
}

export function formatChartNumber(value) {
	if (value == null || !Number.isFinite(value)) return "";
	return CHART_NUMBER_FORMAT.format(value);
}

const CURRENCY_PREFIXES = new Map([
	["元", "¥"],
	["¥", "¥"],
	["cny", "¥"],
	["rmb", "¥"],
	["人民币", "¥"],
	["$", "$"],
	["usd", "$"],
	["美元", "$"],
	["美金", "$"],
]);

// unit="%" 时数值带后缀，货币单位带前缀符号；其余单位仍只画在轴标题上。
function valueFormatterFor(unit) {
	const u = String(unit ?? "").trim();
	if (u === "%") {
		return (value) => {
			const s = formatChartNumber(value);
			return s === "" ? s : `${s}%`;
		};
	}
	const prefix = CURRENCY_PREFIXES.get(u.toLowerCase());
	if (prefix) {
		return (value) => {
			const s = formatChartNumber(value);
			return s === "" ? s : `${prefix} ${s}`;
		};
	}
	return formatChartNumber;
}

// Y 轴上限加 8% 头部空间，避免最大值点贴顶、数值标签被挤压。
const Y_HEADROOM = 1.08;

function headroomMax(values) {
	const finite = values.filter((v) => Number.isFinite(v));
	if (finite.length === 0) return undefined;
	const max = Math.max(...finite);
	return max > 0 ? max * Y_HEADROOM : undefined;
}

// nice 把值域两端取整到整刻度，轴顶因此正好压在带标签的那一档上。升级时以「nice 会
// 把 8% 留白圆掉」为由关过，方向反了——nice 只会往外取，留白只增不减。
// 全图型一律开启，双轴图也不例外。双轴图曾按「升级前本来就没有 nice」保留过不取整，
// 但升级前同时也没有这 8% 留白，两件事凑在一起才成立：留白把轴顶顶到一个不整的数
// （64,500 → 69,660），刻度算法据此改用更粗的一档（10,000），而域外的两端又要按 v4
// 的规矩丢掉，最后左右轴各只剩 2 档，比升级前的 4/5 档明显稀疏。开启 nice 后回到
// 4 档，且轴顶落在刻度上。
// 显式写死而不是依赖默认值：Column 与 DualAxes 的默认选项里都带着 nice: true，
// 不写就等于把这个决定交给引擎。
function yScale({ key, domainMin, domainMax }) {
	const scale = { nice: true };
	if (key !== undefined) {
		scale.key = key;
		// DualAxes 默认把每个 child 的 y 设成 independent，独立后 key 失效、
		// 每个 mark 各自成一套 scale；显式关掉才能按 key 分组共用。
		scale.independent = false;
	}
	if (domainMin !== undefined) scale.domainMin = domainMin;
	if (domainMax !== undefined) scale.domainMax = domainMax;
	return scale;
}

// 刻度算法交回引擎自带的 wilkinsonExtended——升级时判断「v4 那套优化器在 v5 依赖树里
// 够不到」，前提是错的：@antv/scale 一直导出着它，签名也正好是 axis.tickMethod 要的
// (min, max, count) => number[]。实测 v1 的 scale@0.3.18 与现在的 0.5.2 在 27 个真实
// 值域上 27/27 一致，而中间那套自写步长表与 v4 有 18 个不一致（它的候选只有
// 1/2/2.5/5，缺了 v4 有的 3/30/300 一档）。
// 外面只包一层「丢掉域外刻度」：nice 关掉时（双轴图）算法会给出高于 domainMax 的
// 一档，v4 的 Continuous.calculateTicks() 在 nice=false 时同样只保留域内的。
function domainTicks(min, max, count) {
	return wilkinsonExtended(min, max, count).filter((t) => t >= min && t <= max);
}

// y 轴默认画 4px 刻度线，网格线是虚线（主题 axis.gridLineDash = [3, 4]）。这里
// 关掉刻度线、把网格改回 1px 实线；网格颜色跟主题走，由 chart-theme 补上。
const Y_AXIS = {
	tick: false,
	tickMethod: domainTicks,
	gridLineDash: [0, 0],
	gridLineWidth: 1,
	gridStrokeOpacity: 1,
};

// 每个 mark 要拿到独立的 label 对象：plots 会就地把 yField 写进 label.text，
// 共用一个对象时后一个 mark 会沿用前一个的字段。
function valueLabel(field, formatter) {
	return { text: field, formatter, transform: fresh(LABEL_TRANSFORM), ...LABEL_ABOVE };
}

// 光晕往字形轮廓外扩的像素数（两层画法里等于 lineWidth 的一半）。参照系：升级前
// 是 1px，改成两层之前只剩 0.5px。取 2 —— 是升级前的两倍、当前的四倍，明显更厚，
// 又还贴着字形的外廓走；再往上光晕会盖过字号本身的粗细，读起来像一块白底。
const LABEL_HALO_WIDTH = 2;

// 数值标签画成两层：先画一层「光晕」——同一段文字，用光晕色同时描边和填充，得到
// 一个沿字形轮廓外扩 lineWidth/2 的纯色底；再把真正的字叠在上面。
// 非这样不可：v5 的渲染器对文本先填充后描边，描边居中于轮廓，会从笔画两侧各吃掉
// lineWidth/2。实测 bold 12px 的竖笔画约 2px（浅色主题下量到的纯黑字芯 1px，加上
// 当时 lineWidth=1 吃掉的 1px），所以单层最多只能给到 lineWidth<2，外圈不足 1px：
//   单层 w=1   字芯 1.0px，外圈 0.5px
//   单层 w=1.5 字芯 0.5px，外圈 0.75px —— 字已经快被描边色换掉
//   单层 w=2   字芯 0    —— 字整个没了
// 分两层之后描边只作用在下层，上层的字分毫无损，外圈宽度就不再受笔画宽度限制，
// 等于把升级前「描边落在字形背后」的效果拿了回来。
// 上层给一个透明描边、宽度与下层相同：只为让两层的 renderBounds 一致——
// exceedAdjust 按 renderBounds 把越界的标签推回绘图区，两层宽度不同就会推出位移，
// 光晕和字会错开。透明色在 G 里不是 none，照样计入包围盒，但画出来没有颜色。
// 字色取两端的纯色，配 bold：光晕再宽，字身也始终是最深 / 最浅的那一档。
// fontWeight 取关键字 "bold"：G 的 fontWeight 只认 normal / bold / bolder /
// lighter 这几个关键字，数字字重还要看用户主题的字体有没有对应字面，"bold" 有
// CSS 合成加粗兜底，换字体也稳定。
// fillOpacity 必须显式给满：主题的 label 默认 0.65，只改 fill 会被冲淡三成。
export function labelTextStyle(dark) {
	const text = dark ? "#FFFFFF" : "#000000";
	const halo = dark ? "#1F1F1F" : "#FFFFFF";
	const shared = {
		fillOpacity: 1,
		fontWeight: "bold",
		fontSize: VALUE_FONT_SIZE,
		lineWidth: LABEL_HALO_WIDTH * 2,
	};

	return [
		{ ...shared, fill: halo, stroke: halo },
		{ ...shared, fill: text, stroke: "transparent" },
	];
}

// 带数值标签的 mark：单视图挂在 config 上，DualAxes 逐 child 各带一份（柱一份、
// 折线一份，数据点那份 mark 不带标签）。每个 mark 的 label 展开成一层一份，字段和
// 防碰撞配置共用，只有 style 不同。返回改到的 mark，调用方可以核对覆盖面。
// label 写成数组还顺带绕开了 plots 的一处不幂等：单个 label 对象会被搬进 labels 并
// 打上 __transform__ 标记，同一个配置对象再过一次转换时那些元素会被当成上一轮的残留
// 清掉，标签就此消失；数组形式是直接赋值，不打标记，重复转换也留得住。
export function applyLabelStyle(config, styles) {
	const layers = Array.isArray(styles) ? styles : [styles];
	const marks = [config, ...(Array.isArray(config.children) ? config.children : [])];
	const labelled = marks.filter((mark) => mark?.label);
	for (const mark of labelled) {
		const first = Array.isArray(mark.label) ? mark.label[0] : mark.label;
		const { style: _replaced, ...base } = first;
		mark.label = layers.map((style) => ({ ...fresh(base), style: fresh(style) }));
	}
	return labelled;
}

// 悬停蒙层的明暗配色。引擎默认硬编码 fill '#CCD6EC' @0.3，既不读主题 token 也不分
// 明暗：浅色底上叠出带冷蓝的 #F0F3F9，深色底上叠出比底色亮 52 的 #52555C——正好对上
// 「深色太白、浅色太灰」。改用纯黑 / 纯白消掉蓝味，透明度压到 0.05：深色下叠出的明度
// 差（+11）与网格线（+8）同量级，读作一层薄底而不是一块板；浅色下（−13）明显弱于
// 网格线（−38），符合「再淡一点」。可调区间浅色 0.04–0.07、深色 0.04–0.06，低于 0.03
// 在低对比度屏上会整个消失。
// 不用 Obsidian 的 --background-modifier-hover：G2 画在 canvas 上，取值得走
// getComputedStyle，网格线那一处已经为此放弃过这条路；而且那个 token 是为 30px 的
// 列表行调的，同样的 alpha 铺满整个绘图区高度会明显更重，取值还由三方主题作者决定。
export function hoverBandStyle(dark) {
	return { backgroundFill: dark ? "#FFFFFF" : "#000000", backgroundFillOpacity: 0.05 };
}

// 把蒙层配色填进上面留下的 state.active 空壳。单视图图表的壳在 config 自己身上，
// DualAxes 的壳挂在顶层、由 plots 深合并下发给每个 child。返回改到的 mark，调用方
// 可以核对覆盖面。
export function applyHoverBandStyle(config, style) {
	const marks = [config, ...(Array.isArray(config.children) ? config.children : [])];
	const banded = marks.filter((mark) => mark?.state?.active);
	for (const mark of banded) {
		mark.state = {
			...mark.state,
			active: { ...mark.state.active, ...fresh(style) },
		};
	}
	return banded;
}

// 悬停竖线的明暗配色。默认的 #1b1e23 @0.5 叠在深色底上明度差不到 2，实际是看不见的；
// 取两端纯色配 0.25，明暗两套叠加后与背景的明度差都约 60，观感对称。
export function crosshairStyle(dark) {
	return { crosshairsStroke: dark ? "#FFFFFF" : "#000000" };
}

// 按「配了线宽的那份才上色」定位：柱图的 interval mark 不声明 crosshairs，组合图更是
// 显式关掉了竖线——给它们上色只会留下一份永远不生效的配置。
export function applyCrosshairStyle(config, style) {
	const tooltip = config.interaction?.tooltip;
	if (tooltip?.crosshairsLineWidth === undefined) return undefined;
	config.interaction = {
		...config.interaction,
		tooltip: { ...tooltip, ...fresh(style) },
	};
	return config.interaction.tooltip;
}

// v5 的 scale 没有 formatter：轴刻度走 axis.labelFormatter，数值标签走
// label.formatter，tooltip 走 items 回调。回调不返回 name 时沿用系列名。
function valueTooltip(field, formatter) {
	return { items: [(datum) => ({ value: formatter(datum[field]) })] };
}

function splitList(value) {
	return String(value ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function parseGranularityOptions(attributes) {
	const raw = splitList(attributes.granularityOptions).map((g) =>
		g.toLowerCase(),
	);
	if (raw.length === 0) return [...DATASET_GRANULARITIES];
	for (const g of raw) {
		if (!isDatasetGranularity(g))
			throw new Error(`Unknown granularity "${g}" in granularityOptions.`);
	}
	return raw;
}

function labelsEnabled(attributes) {
	const v = String(attributes.labels ?? "")
		.trim()
		.toLowerCase();
	return !LABELS_OFF.has(v);
}

function labelFor(attributes, key) {
	return attributes[`${key}Label`] || key;
}

function colorsFor(attributes, keys, offset = 0) {
	return keys.map((key, i) => {
		const v = String(attributes[`${key}Color`] ?? "").trim();
		return HEX_COLOR.test(v)
			? v
			: CHART_COLORS[(offset + i) % CHART_COLORS.length];
	});
}

function toLong(rows, xKey, keys, attributes, valueField = "value") {
	const out = [];
	for (const row of rows) {
		for (const key of keys) {
			out.push({
				period: String(row[xKey]),
				series: labelFor(attributes, key),
				[valueField]: row[key] == null ? null : Number(row[key]),
			});
		}
	}
	return out;
}

export function buildFootnote(meta) {
	return (
		`${meta.datasetTitle} · ${meta.from} → ${meta.to} · ${meta.granularity}` +
		` · ${meta.sourceRows}/${meta.totalRows} source rows · data through ${meta.dataThrough}`
	);
}

function buildWarning(meta) {
	const parts = [];
	if (meta.partialPeriodCount > 0)
		parts.push(`Partial boundary periods: ${meta.partialPeriods.join(", ")}`);
	if (meta.omittedBoundaryPeriodCount > 0)
		parts.push(
			`Incomplete boundary periods omitted: ${meta.omittedBoundaryPeriods.join(", ")}`,
		);
	if (meta.missingPeriodCount > 0)
		parts.push(`${meta.missingPeriodCount} source periods missing within the range`);
	return parts.length ? parts.join("; ") : undefined;
}

function buildChartFromRows({ rows, attrs, attributes, xKey, common }) {
	const bars = splitList(attrs.bars ?? attrs.bar);
	const lines = splitList(attrs.lines ?? attrs.line);
	const explicit = splitList(attrs.series ?? attrs.y);
	let seriesKeys = explicit.length ? explicit : [...bars, ...lines];
	if (seriesKeys.length === 0) {
		seriesKeys = Object.keys(rows[0] ?? {}).filter((k) => k !== xKey);
	}
	const rawType = String(attrs.type ?? "")
		.trim()
		.toLowerCase();
	const type = CHART_TYPES.has(rawType)
		? rawType
		: seriesKeys.length > 1
			? "line"
			: "bar";
	const showLabels = labelsEnabled(attrs);

	if (type === "combo" || type === "combo-dual-axis") {
		let barKeys = bars,
			lineKeys = lines;
		if (barKeys.length === 0 && lineKeys.length === 0) {
			[barKeys, lineKeys] = [seriesKeys.slice(0, 1), seriesKeys.slice(1)]; // 早期内部实现 默认：首个为 bar，其余为 line
		}
		if (barKeys.length === 0 || lineKeys.length === 0) {
			throw new Error(
				`Chart type "${type}" needs both bar and line series (use bars= and lines=).`,
			);
		}
		const barLong = toLong(rows, xKey, barKeys, attrs, "barValue");
		const lineLong = toLong(rows, xKey, lineKeys, attrs, "lineValue");
		const dual = type === "combo-dual-axis";
		const leftUnit = String(attrs.leftUnit ?? attrs.unit ?? "");
		const rightUnit = String(attrs.rightUnit ?? "");
		const barFormatter = valueFormatterFor(dual ? leftUnit : attrs.unit);
		const lineFormatter = valueFormatterFor(dual ? rightUnit : attrs.unit);
		let barY, lineY;
		if (dual) {
			barY = yScale({
				key: "barY",
				domainMax: headroomMax(barLong.map((d) => d.barValue)),
			});
			lineY = yScale({
				key: "lineY",
				domainMax: headroomMax(lineLong.map((d) => d.lineValue)),
			});
		} else {
			// combo 两侧共用同一段值域，左右轴刻度因此互为镜像。
			const domainMax = headroomMax([
				...barLong.map((d) => d.barValue),
				...lineLong.map((d) => d.lineValue),
			]);
			barY = yScale({ key: "barY", domainMin: 0, domainMax });
			lineY = yScale({ key: "lineY", domainMin: 0, domainMax });
		}
		const barAxis = {
			y: {
				...fresh(Y_AXIS),
				labelFormatter: barFormatter,
				...(dual && leftUnit ? { title: leftUnit } : {}),
			},
		};
		const lineAxis = {
			y: {
				...fresh(Y_AXIS),
				position: "right",
				// 每条连续轴默认自带一层网格。右轴的刻度和左轴不在同一批高度上，
				// 两层网格叠出来是两倍密度的横线；网格只留给左轴。
				grid: false,
				labelFormatter: lineFormatter,
				...(dual && rightUnit ? { title: rightUnit } : {}),
			},
		};
		const barChild = {
			type: "interval",
			data: barLong,
			yField: "barValue",
			colorField: "series",
			group: barKeys.length > 1 ? fresh(GROUP_DODGE) : false,
			scale: { y: barY },
			axis: barAxis,
			label: showLabels ? valueLabel("barValue", barFormatter) : undefined,
			tooltip: valueTooltip("barValue", barFormatter),
		};
		const lineChild = {
			type: "line",
			data: lineLong,
			yField: "lineValue",
			colorField: "series",
			scale: { y: lineY },
			axis: lineAxis,
			style: fresh(LINE_STROKE),
			label: showLabels ? valueLabel("lineValue", lineFormatter) : undefined,
			tooltip: valueTooltip("lineValue", lineFormatter),
		};
		// 数据点写成折线的兄弟 mark，而不是折线的 point 简写：简写生成的 mark
		// 不继承 data / scale，且总被追加到 children 末尾（会盖在柱子上）。
		// 它和折线共用同一段 y scale，因此必须给出同一份 axis——G2 按 scale 分组
		// 合并 guide，两份不一致时后写的会覆盖先写的。
		const pointChild = {
			...fresh(LINE_POINT),
			type: "point",
			data: lineLong,
			yField: "lineValue",
			colorField: "series",
			scale: { y: lineY },
			axis: lineAxis,
			tooltip: false,
		};
		// combo（单轴）图例顺序跟随标签书写顺序；combo-dual-axis 固定 bars=左轴。
		const attrKeys = Object.keys(attributes);
		const linesFirst =
			!dual &&
			(() => {
				const lineIdx = attrKeys.findIndex(
					(k) => k === "lines" || k === "line",
				);
				const barIdx = attrKeys.findIndex((k) => k === "bars" || k === "bar");
				return lineIdx !== -1 && barIdx !== -1 && lineIdx < barIdx;
			})();
		// 一张图只有一套 color scale，两个 mark 各给一份 range 会互相覆盖：
		// 配色按 children 的绘制顺序拼成一份，挂在顶层下发给全部 children。
		const range = linesFirst
			? [...colorsFor(attrs, lineKeys), ...colorsFor(attrs, barKeys, lineKeys.length)]
			: [...colorsFor(attrs, barKeys), ...colorsFor(attrs, lineKeys, barKeys.length)];
		return {
			...common,
			chartType: "DualAxes",
			config: {
				xField: "period",
				scale: { color: { range }, x: fresh(BAR_X_SCALE) },
				legend: fresh(LEGEND),
				labelTransform: fresh(VIEW_LABEL_TRANSFORM),
				state: fresh(HOVER_BAND_STATE),
				// 写在顶层是唯一正确的路径：plots 的 transformOptions 把 interaction
				// 收进 rest、深合并进每个 child mark，G2 的 bubbleOptions() 再把 mark
				// 上的 interaction 合并回 view。两个键都不在 TRANSFORM_OPTION_KEY 里，
				// 转换过后不会被清掉。
				interaction: fresh(COMBO_INTERACTION),
				children: linesFirst
					? [lineChild, pointChild, barChild]
					: [barChild, lineChild, pointChild],
			},
		};
	}

	const data = toLong(rows, xKey, seriesKeys, attrs);
	const unit = String(attrs.unit ?? "");
	const formatter = valueFormatterFor(unit);
	// stacked-bar 的视觉上限是每期堆叠和，其余按单值最大。
	const yMax =
		type === "stacked-bar"
			? headroomMax(
					[
						...data
							.reduce((m, d) => {
								if (Number.isFinite(d.value))
									m.set(d.period, (m.get(d.period) ?? 0) + d.value);
								return m;
							}, new Map())
							.values(),
					],
				)
			: headroomMax(data.map((d) => d.value));
	const config = {
		data,
		xField: "period",
		yField: "value",
		// colorField 而非 seriesField：v5 的 seriesField 只拆分系列不着色，也不出
		// 图例；分组 / 堆叠取不到 series 通道时会回落到 color 通道，够用。
		colorField: "series",
		scale: { color: { range: colorsFor(attrs, seriesKeys) }, y: yScale({ domainMax: yMax }) },
		label: showLabels ? valueLabel("value", formatter) : undefined,
		labelTransform: fresh(VIEW_LABEL_TRANSFORM),
		axis: { y: { ...fresh(Y_AXIS), labelFormatter: formatter, ...(unit ? { title: unit } : {}) } },
		tooltip: valueTooltip("value", formatter),
		legend: fresh(LEGEND),
	};
	if (type === "line")
		return {
			...common,
			chartType: "Line",
			config: {
				...config,
				point: fresh(LINE_POINT),
				style: fresh(LINE_STROKE),
				interaction: fresh(CROSSHAIR_INTERACTION),
			},
		};
	// 柱宽只对 interval mark 有意义，折线图不加；悬停蒙层同理。
	const barConfig = {
		...config,
		scale: { ...config.scale, x: fresh(BAR_X_SCALE) },
		state: fresh(HOVER_BAND_STATE),
		// plots 的 Column 默认已开 background，这里补的是 region——让蒙层与组合图
		// 一样「进列就出」，而不是必须压在柱体上。
		interaction: fresh(BAR_INTERACTION),
	};
	if (type === "grouped-bar")
		return {
			...common,
			chartType: "Column",
			config: { ...barConfig, group: fresh(GROUP_DODGE) },
		};
	if (type === "stacked-bar")
		return {
			...common,
			chartType: "Column",
			config: { ...barConfig, stack: true },
		};
	return { ...common, chartType: "Column", config: barConfig }; // "bar"
}

export function buildChartFromTag({
	manifest,
	rows,
	attributes,
	granularity,
}) {
	const granularityOptions = parseGranularityOptions(attributes);
	const requested = String(granularity ?? attributes.granularity ?? "auto")
		.trim()
		.toLowerCase();
	if (requested !== "auto" && !granularityOptions.includes(requested)) {
		throw new Error(
			`Granularity "${requested}" is not in granularityOptions (${granularityOptions.join(",")}).`,
		);
	}
	const result = queryDataset({
		manifest,
		rows,
		component: "Chart",
		attributes,
		granularity: requested,
		granularityOptions,
	});
	const common = {
		footnote: buildFootnote(result.meta),
		warning: buildWarning(result.meta),
		granularity: result.meta.granularity,
		availableGranularities: result.meta.availableGranularities,
	};
	return buildChartFromRows({
		rows: result.rows,
		attrs: result.attributes,
		attributes,
		xKey: result.attributes.x,
		common,
	});
}

// 内联数据（代码块 CSV body / 成对标签 payload）出图：无 dataset 查询语义，
// 数据按书写顺序原样呈现；格式化/配色/头部空间/图例与 dataset 模式一致。
const DATASET_ONLY_ATTRS = ["dataset", "from", "to", "granularity", "granularityOptions"];

export function buildChartFromInline({ attributes = {}, csv }) {
	for (const key of DATASET_ONLY_ATTRS) {
		if (String(attributes[key] ?? "").trim() !== "") {
			throw new Error(
				`Inline data does not support the "${key}" attribute (dataset charts only).`,
			);
		}
	}
	const records = parseDelimitedRecords(csv);
	if (records.length < 2) {
		throw new Error("Inline CSV needs a header row and at least one data row.");
	}
	const [header, ...dataRecords] = records;
	const columns = header.map((h) => String(h).trim());
	if (new Set(columns).size !== columns.length) {
		throw new Error("Inline CSV header has duplicate column names.");
	}
	const xKey = String(attributes.x ?? columns[0]).trim();
	const declared = [
		attributes.series,
		attributes.y,
		attributes.bars,
		attributes.bar,
		attributes.lines,
		attributes.line,
	].flatMap(splitList);
	for (const name of [xKey, ...declared]) {
		if (!columns.includes(name)) {
			throw new Error(`Inline CSV has no "${name}" column.`);
		}
	}
	const rows = dataRecords.map((record, index) => {
		const row = {};
		columns.forEach((name, i) => {
			const cell = String(record[i] ?? "").trim();
			if (name === xKey) {
				row[name] = cell;
				return;
			}
			if (cell === "") {
				row[name] = null;
				return;
			}
			const n = Number(cell);
			if (!Number.isFinite(n)) {
				throw new Error(
					`Inline CSV row ${index + 2}: "${name}" value "${cell}" is not a number.`,
				);
			}
			row[name] = n;
		});
		return row;
	});
	return buildChartFromRows({
		rows,
		attrs: attributes,
		attributes,
		xKey,
		common: {
			footnote: undefined,
			warning: undefined,
			granularity: "source",
			availableGranularities: [],
		},
	});
}
