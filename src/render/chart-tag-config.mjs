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
// 悬停蒙层的配色挂在 mark 的 state.active 上——elementHighlight 从那里取 background
// 前缀的键喂给它的 renderBackground()。这里只留空壳，明暗色值由 chart-theme 在
// withTheme() 里注入，和网格线颜色走同一条路。
// 壳不能省：mergeState 生成的是按 mark key 分派的函数，mark 自己不带这组键时直接
// 回退到引擎默认值，注入无处可落。
const HOVER_BAND_STATE = { active: {} };

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

// 给了 domainMax 就必须关掉 nice：nice 会把域再往上取整到刻度边界，
// 8% 头部空间会被撑成一段不确定的留白，刻度也跟着变。
function yScale({ key, domainMin, domainMax }) {
	const scale = {};
	if (key !== undefined) {
		scale.key = key;
		// DualAxes 默认把每个 child 的 y 设成 independent，独立后 key 失效、
		// 每个 mark 各自成一套 scale；显式关掉才能按 key 分组共用。
		scale.independent = false;
	}
	if (domainMin !== undefined) scale.domainMin = domainMin;
	if (domainMax !== undefined) {
		scale.domainMax = domainMax;
		scale.nice = false;
	}
	return scale;
}

// 刻度步长：默认实现的步长只取 1、2、5 × 10^k，凑不到 count 档就一律退到更细
// 的一档，档数接近翻倍（$69,660 的值域被切成 $10,000 一档共 7 档）。这里把 2.5
// 也算进候选，并在 1/2/2.5/5 × 10^k 里挑档数最接近 count 的那个步长，档数打平
// 时取更细的（同一值域给出 $20,000 一档共 4 档）。只返回落在值域内的刻度。
const TICK_STEPS = [1, 2, 2.5, 5];

function niceTicks(min, max, count = 5) {
	if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
	const target = Math.max(2, Math.round(count));
	// 候选从「理想步长的十分之一」起往上铺四个数量级，足够把最优解框在里面。
	const base = Math.floor(Math.log10((max - min) / target)) - 1;
	let best;
	for (let k = base; k <= base + 3; k += 1) {
		for (const mantissa of TICK_STEPS) {
			const step = mantissa * 10 ** k;
			const first = Math.ceil(min / step);
			const last = Math.floor(max / step);
			if (last < first) continue;
			const miss = Math.abs(last - first + 1 - target);
			if (best === undefined || miss < best.miss) best = { step, first, last, miss };
		}
	}
	if (best === undefined) return [min];
	const ticks = [];
	for (let i = best.first; i <= best.last; i += 1) {
		const value = i * best.step;
		// i * step 会带浮点尾巴（0.25 的 13 倍算成 3.2500000000000004），
		// 尾巴会原样出现在轴文案里。
		ticks.push(value === 0 ? 0 : Number(value.toPrecision(12)));
	}
	return ticks;
}

// y 轴默认画 4px 刻度线，网格线是虚线（主题 axis.gridLineDash = [3, 4]）。这里
// 关掉刻度线、把网格改回 1px 实线；网格颜色跟主题走，由 chart-theme 补上。
const Y_AXIS = {
	tick: false,
	tickMethod: niceTicks,
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
	const shared = { fillOpacity: 1, fontWeight: "bold", lineWidth: LABEL_HALO_WIDTH * 2 };
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
			group: barKeys.length > 1,
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
				state: fresh(HOVER_BAND_STATE),
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
		axis: { y: { ...fresh(Y_AXIS), labelFormatter: formatter, ...(unit ? { title: unit } : {}) } },
		tooltip: valueTooltip("value", formatter),
		legend: fresh(LEGEND),
	};
	if (type === "line")
		return {
			...common,
			chartType: "Line",
			config: { ...config, point: fresh(LINE_POINT), style: fresh(LINE_STROKE) },
		};
	// 柱宽只对 interval mark 有意义，折线图不加；悬停蒙层同理。
	const barConfig = {
		...config,
		scale: { ...config.scale, x: fresh(BAR_X_SCALE) },
		state: fresh(HOVER_BAND_STATE),
	};
	if (type === "grouped-bar")
		return {
			...common,
			chartType: "Column",
			config: { ...barConfig, group: true },
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
