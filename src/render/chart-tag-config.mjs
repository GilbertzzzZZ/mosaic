// register 必须从 plots 导入而不是 g2：plots 打包了自己那份 g2，两份 g2 各有一张
// 形状注册表，注册到另一张表上的形状图例查不到。
import { register } from "@ant-design/plots";
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
// 了一根发丝。取 3 —— 用户逐项确认的值，比升级前还粗一档。style 不在 plots 的
// EXTENDED_PROPERTIES 里，不会渗进 point 简写生成的子 mark，数据点半径不受影响。
const LINE_STROKE = { lineWidth: 3 };
// 图例的折线标记：12 宽 × 4 高的横杠，必须自定义形状——内置的走不通，三条硬伤：
// 引擎有一层反向缩放（@antv/component 的 scaleToPixel + Item.scaleSize），
//   渲染尺寸 = bbox × (1 − lineWidth·√2 / 16) × itemMarkerSize / 16
// 分母恒为 16：形状路径的半径永远取主题的 itemMarkerSize（8），用户写的那个只用来
// 定归一化目标。反解「12 宽 4 高」得 itemMarkerSize 22.702 / itemMarkerLineWidth
// 5.3333，数学上可解但 (1) 布局按 itemMarkerSize 算，可见间距被撑到 9.35；
// (2) 行高取 max(itemMarkerSize, 文字高 16)，图例带从 28px 涨到 34.7px；
// (3) itemMarkerSize 是整个图例共享的标量，方块要 12、横杠要 22.7，没法共存。
// 自定义形状一次绕开三条：长边被归一到 itemMarkerSize，3:1 的自然长宽比渲染出来
// 恒为 S × S/3，与主题的 itemMarkerSize 无关，主题以后改那个值也不会坏。
// .style 必填：useMarker 直接读 symbol.style.includes('stroke')，不设会 TypeError。
// 取 fill 类而不是 stroke 类：fill 类的 lineWidth 恒为 0，不触发上面那层反向缩放。
const LEGEND_BAR_SYMBOL = "legendBar";
const legendBar = (x, y, r) => [
	["M", x - r, y - r / 3],
	["L", x + r, y - r / 3],
	["L", x + r, y + r / 3],
	["L", x - r, y + r / 3],
	["Z"],
];
legendBar.style = ["fill"];
register(`symbol.${LEGEND_BAR_SYMBOL}`, legendBar);

// 图例方块 12×12。itemMarkerLineWidth 必须显式写 0：inferItemMarkerLineWidth 只有
// 在用户显式给值时才短路，否则会按「形状是不是线类」自动塞 lineWidth = 4，而那个 4
// 会通过上面的反向缩放把方块缩到 5.17px、把间距撑到 9.42px。现在没发生只是因为数据
// 点用了 shapeField: "circle" 顺带建了一条形状比例尺把判定带偏——数据点写法一改，
// 图例方块就会无声缩水三成。
const LEGEND_MARKER_SIZE = 12;
// itemSpacing 的三段依次是「色块↔文字」「文字↔数值」「数值↔焦点」（@antv/component
// 的 legend/category/item.ts 里的 spacing1/2/3）。只收第一段，其余留主题默认 8/4。
const LEGEND_ITEM_SPACING = [4, 8, 4];

// 图例：顶部居中，折线系列用横杠、其余用方块。
// 位置和对齐是两个键，且对齐写在 layout 这一层（没有 align 这个键）：引擎按
// position 查表得到布局预设，top 对应 ['row', 'flex-start', 'center']，flex-start
// 就是「顶部左对齐」的来源；用户给的 layout 会覆盖预设（inferComponentLayout）。
// 居中是相对图例自己的包围盒（≈整个画布宽）而不是绘图区，配置层面没有「相对绘图区
// 居中」的开关，单轴图因此会偏左十几像素。
// itemMarker 写成回调：参数是系列名（引擎传的是 d.id），按折线系列的标签集合分流。
// 注意「默认时折线是短线、柱状是方块」对引擎成立、对本插件不成立——本插件的实际默认
// 是「折线圆点、柱状方块」，组合图更是四项全圆，所以两类都得点名。
// LEGEND 不能是模块级常量：回调依赖每张图自己的折线标签集合。
function legendConfig(lineLabels = []) {
	const lines = new Set(lineLabels);
	return {
		color: {
			position: "top",
			layout: { justifyContent: "center" },
			itemMarker: (name) => (lines.has(name) ? LEGEND_BAR_SYMBOL : "square"),
			itemMarkerSize: LEGEND_MARKER_SIZE,
			itemMarkerLineWidth: 0,
			itemSpacing: [...LEGEND_ITEM_SPACING],
		},
	};
}
// 数值标签防碰撞，三段，顺序不可换：
//   exceedAdjust    把越界标签平移回绘图区（首尾数据点贴着边缘，缺这步会被后面整个隐藏）
//   overlapDodgeY   迭代把碰撞的标签上下错开，从不隐藏——这一段是「错开优先」的本体
//   overlapHide     错不开的兜底隐藏
// 三个变换的实现都以「先把全部标签设为可见」开头，而变换从左到右复合，所以后一个
// 隐藏型会撤销前一个的隐藏结果：隐藏型只能有一个，且必须排在最后。
const LABEL_TRANSFORM = [
	{ type: "exceedAdjust", bounds: "main" },
	{ type: "overlapDodgeY", padding: 2, maxIterations: 20 },
	{ type: "overlapHide" },
];
// 曾经还有一份视图级的 labelTransform（顶层 config.labelTransform），声称能跨 mark
// 去重叠。它从未运行过：plots 的 transformOptions 把顶层 labelTransform 下发进每个
// mark 并从顶层删除（它不在 VIEW_OPTIONS 白名单里），而 G2 只从 view 节点读这个键
// （runtime/plot.js 的 initializeState → plotLabels），mark 上那份无人读取。
// 它同时是个定时炸弹：数值标签是双层画的（光晕层 + 文字层）、两层位置完全重合，而
// overlapHide 是「先到先得、后来者碰上就隐藏」，文字层永远排在光晕层之后——一旦真的
// 生效，所有文字层会被全部隐藏，只剩与背景同色的光晕层，数字集体消失。
// 教训：原测试断言的是「配置对象上有这个键」，而不是「这个能力真的生效」。配置对，
// 效果是零。所以顶层一律不写 labelTransform，并有一条反向断言守着。
// 标签默认从锚点往下画：柱状图的锚点是柱顶，文字落进柱体内部；折线的锚点只有
// 一个点、位置处理器不给对齐方式，退回 G 的 start/alphabetic，文字落在点右侧。
// 改成画在图元外侧：文本框边距锚点 4px，框边到字形还有约 4px 字体伸展空间，
// 合起来是图元外约 8px 的空隙。
// 正负分流，三个键缺一不可：
//   position     决定锚点取包围盒的哪条边。负值柱的包围盒**顶边就是零轴**，
//                留在 'top' 的话标签会贴在 0 上、与朝下的柱子背道而驰。
//   textBaseline 决定文字画在锚点的哪一侧。
//   dy           把文字再推离图元 4px，方向随正负翻转。
// 写成回调是合法的：runtime 对 label 的每个选项都过一遍 valueOf()——是函数就按
// 当前数据点调用（runtime/plot.js 的 createLabelShapeFunction）。所以一份模板能
// 服务所有 mark，不必按字段名各生成一份，也就不会破坏「所有标签配置一致」的约束。
// toLong() 只会写出 value / barValue / lineValue 三者之一，取到哪个就是哪个。
const isNegative = (datum) =>
	Number(datum?.value ?? datum?.barValue ?? datum?.lineValue ?? 0) < 0;
const LABEL_OUTSIDE = {
	textAlign: "center",
	position: (d) => (isNegative(d) ? "bottom" : "top"),
	textBaseline: (d) => (isNegative(d) ? "top" : "bottom"),
	dy: (d) => (isNegative(d) ? 4 : -4),
};
// 堆叠柱专用：数字画在每一段的正中间。堆叠柱的每一段是独立图元，包围盒就是该段
// 自己的矩形（不是整根柱子），position: "inside" 落在该矩形的几何中心。
// 三个连带项缺一不可：
//   dy 归零        —— 留着 ±4 会整体偏 4px
//   正负不分流     —— inside 对正负是同一个答案，保留 (d) => isNegative(d) ? ... 的
//                     回调会把负值段的标签又推到段底边
//   变换链留空     —— 用户确认「永远画，溢出就溢出」：既不隐藏，overlapDodgeY 也不能
//                     用，它会把标签上下推开，正好毁掉「段内居中」
// "middle" / "center" 不是合法取值，不在位置派发表里，写了会抛异常（不是静默回退）。
const LABEL_CENTER = {
	textAlign: "center",
	position: "inside",
	textBaseline: "middle",
	dy: 0,
};
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
// 读数用的字号：数值标签与 tooltip 共用一档。图里其余文字（轴刻度、轴标题、图例）
// 都不设，仍走引擎主题的 12px——读数是图表要传达的那个东西，只把它抬起来。
// 标签光晕的宽度不跟着这个数走：两层画法里光晕是下层字形的描边，外扩量由 lineWidth
// 单独决定，与字号无关。只有单层描边才需要按笔画粗细算比例。
const VALUE_FONT_SIZE = 14;
// tooltip 不画在 canvas 上，是一个真的 DOM 元素，字号来自组件的默认样式表（12px）。
// 那张表是用 element.style.cssText += 写成**内联样式**的，styles.css 里的选择器不加
// !important 压不过它。interaction.tooltip.css 是引擎留的正规入口，会被 deepMix 进
// 同一张表，改出来仍是内联样式，优先级一致，也就不必动 !important。
// 这里只放与明暗无关的排版；颜色（文字、描边色、边框色）由 chart-theme 在
// withTheme() 里通过 applyTooltipStyle 注入，和网格线、悬停蒙层走同一条路。
// 紧凑化的四处对照（深色主题实测原值）：容器 padding 12 → 8/10，条目行高 2em(28px)
// → 1.5em，min-width 120px → 0（长宽随内容走），max-width 360 → 240。
// 数值那一列原本有 margin-left: 30px + min-width: 28px 撑着，一起收掉才真的变窄。
// 描边：tooltip 是 DOM 不是 canvas，用 CSS 的 -webkit-text-stroke 实现。写成
// width / color 两个 longhand 而不是简写，才好把色值单独交给 chart-theme。
// 宽度与 canvas 那层不是同一个口径，别照抄：canvas 那层 lineWidth 给 4，描边居中于
// 轮廓、外扩 2px；这里 2px 的描边同样居中，paint-order 让文字盖掉内侧一半，实际外扩
// 1px。DOM 上的字比 canvas 上的数字小一档、底色也不透明，1px 够用。
// paint-order 这一行不能省——它正是标签那套双层画法要解决的同一个问题：默认描边居中
// 于字形轮廓，会从笔画两侧各吃掉一半线宽；paint-order: stroke fill 让描边先画、文字
// 后覆盖，字身分毫无损。DOM 侧有这个属性，所以不必像 canvas 那样画两层。
// 边框与描边都要：紧凑化之后 padding 收窄、min-width 放开，边界会变模糊，边框给出
// 明确的框；描边保证文字在任何底色上都读得出——两者解决的是不同问题。
const TOOLTIP_TEXT_STROKE_WIDTH = 2;
const TOOLTIP_CSS = {
	".g2-tooltip": {
		"font-size": `${VALUE_FONT_SIZE}px`,
		"line-height": "1.5",
		padding: "8px 10px",
		"min-width": "0",
		"max-width": "240px",
		"border-width": "1px",
		"border-style": "solid",
		"-webkit-text-stroke-width": `${TOOLTIP_TEXT_STROKE_WIDTH}px`,
		"paint-order": "stroke fill",
	},
	".g2-tooltip-list-item": { "line-height": "1.5em" },
	".g2-tooltip-list-item-value": { "margin-left": "12px", "min-width": "0" },
};
// 折线悬停时跟着鼠标走的那条竖线。引擎默认硬编码 1px、#1b1e23、0.5 不透明度，同样
// 不读主题：深色底上那个色叠出来几乎不可分辨。线宽保持 2，比数据线细一档——它是辅助
// 线，不该和数据线（3）一样重。stroke 由 chart-theme 注入。
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

// x 轴上被 highlight= 点名的那几期：轴标签加粗。
// 轴标签的每个 label* 样式键都能写成按刻度调用的回调——@antv/component 的
// renderLabel 走 getCallbackStyle(style, [datum, index, data])，datum 是
// { value, label, id }，label 就是这一格的周期文本（G2 的 getData 里
// toString(labelFormatter(prettyNumber(d), ...))，prettyNumber 原样放行非数字）。
// 字重取关键字而不是数字：G 的 fontWeight 只认 normal / bold / bolder / lighter，
// 数字字重还要看用户主题的字体有没有对应字面，"bold" 有 CSS 合成加粗兜底。
// highlight 的另外两件事在 G2 v5 下做不到，见 docs 与本次实施报告：
//   标签底色 —— 轴标签是一个裸的 @antv/g Text，@antv/component 的轴 label 样式表里
//               没有任何 background* 键（text mark 和图例项才有 backgroundFill）。
//               注意这说的只是「轴标签背后的底色」；绘图区里的竖向色带是另一回事，
//               走的是下面的 highlightBand()，做得到。
//   强制显示 —— 轴标签抽稀是 @antv/component 的 autoHide，按「奇偶步长 + 几何相交」
//               整批取舍（items.filter((d, i) => i % seq ...)），只有 keepHeader /
//               keepTail 两个开关，没有按项豁免的入口。
function highlightAxisX(periods) {
	if (periods.length === 0) return undefined;
	const marked = new Set(periods);
	return { labelFontWeight: (d) => (marked.has(d?.label) ? "bold" : "normal") };
}

// 加粗之外的第二层：被点名的那一期，整列铺一条竖向背景色带。只加粗太弱——用户看过
// 实物后的原话是「要仔细看才发现」。色带画在绘图区里，不是画在轴标签背后：轴标签是
// 一个裸的 @antv/g Text，@antv/component 的轴 label 样式表里没有任何 background* 键，
// 那条路走不通（见上面 highlightAxisX 的注释）。
//
// 用 G2 内置的 rangeX mark，两个方向都不用算坐标：
//   高度  RangeX = AbstractRange({ extendY: true })，extendY 让 y 方向恒取 [0, 1]，
//         色带自动铺满整个绘图区，既不用给 y 值，也不进 y scale 的值域。
//   宽度  range.ts 的 extend() 里有 `C1[i] + scale.getBandWidth(scale.invert(+C1[i]))`，
//         band scale 原生支持：x 与 x1 给同一个类别值，色带就正好补成那一列的宽度。
// x1 必须显式写：extend() 解构的是 value.x 和 value.x1 两个通道，只给 x 会在 C1[i]
// 上抛 TypeError——rangeX 的 MaybeDefaultX 只给「数组型 data」补 x1，对象型不补。
//
// 挂在 annotations 而不是自己往 children 里塞：plots 的 transformOptions 把顶层配置
// （data / xField / yField / colorField / label / state / legend …）深合并进每一个
// children 成员，自己塞就等于让色带继承整套数据映射——会拿到 encode.color（于是进
// 图例）、labels（于是画数值标签）、state.active（于是跟着悬停变色）。annotations
// 这条路的 extendedProperties 是空数组，一样都不继承，而且自带 tooltip: false。
// 顺带解决「组合图画几次」：annotations 写在顶层，无论视图里有几个数据 mark，色带
// 都只生成一个 mark。
//
// zIndex 必须写：annotations 一律被 push 到 children 末尾，绘制顺序上会盖在数据之上。
// G2 给每个 mark 建一层 main layer <g> 并写 style.zIndex = mark.zIndex ?? 0
// （runtime/plot.js 的 updateLayers），取 -1 就把色带那层压到全部数据层之下。
const HIGHLIGHT_BAND_Z_INDEX = -1;
function highlightBand(periods) {
	if (periods.length === 0) return undefined;
	return [
		{
			type: "rangeX",
			data: periods.map((period) => ({ period })),
			encode: { x: "period", x1: "period" },
			zIndex: HIGHLIGHT_BAND_Z_INDEX,
			// 空壳：明暗色值由 chart-theme 在 withTheme() 里注入，和悬停蒙层走同一条路。
			style: {},
		},
	];
}

// 每个 mark 要拿到独立的 label 对象：plots 会就地把 yField 写进 label.text，
// 共用一个对象时后一个 mark 会沿用前一个的字段。
// centered 是堆叠柱专用的段内居中口径，见 LABEL_CENTER。
function valueLabel(field, formatter, centered = false) {
	return centered
		? { text: field, formatter, transform: [], ...LABEL_CENTER }
		: { text: field, formatter, transform: fresh(LABEL_TRANSFORM), ...LABEL_OUTSIDE };
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
// overlapDodgeY 现在也吃这条不变量，而且更吃：runtime 的 plotLabels 按 label 配置
// 对象分组跑变换（labelDescriptor），两层是两个不同的配置对象，所以各自成一组、
// 各算各的位移——两组的输入几何必须逐像素相同，算出来的位移才会相同。两层因此从来
// 不会互相碰撞（也就不会自己躲自己），但只要 renderBounds 一旦不等，光晕就会和字
// 分家。改这里的 lineWidth 前先想清楚这一条。
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

// highlight= 色带的明暗配色。和悬停蒙层同源——两端纯色消掉色相，只用透明度分强弱。
// 取 0.1，正好是悬停蒙层的两倍：悬停蒙层是划过就没的临时反馈，可以压到几乎看不见；
// 色带是一直画着的标记，用户看过只加粗的版本后的结论就是「太弱」。
// 两套主题对照（深色底按 #1E1E1E、浅色底按 #FFFFFF 算叠加后的明度差）：
//   深色  +22（网格线 +8，悬停蒙层 +11）
//   浅色  −26（网格线 −38，悬停蒙层 −13）
// 即：两套都比网格线更显眼一档，浅色下仍弱于网格线，深色下强于网格线但远不到能压过
// 数据的程度——色带在数据之下画（zIndex −1），柱子和折线始终是最上面那层。
// 两层会同时出现（鼠标正好停在被标记的那一列）：0.1 打底再叠 0.05 得 0.145，仍读得出
// 「这一列被悬停了」，不会糊成一块。
export function highlightBandStyle(dark) {
	return { fill: dark ? "#FFFFFF" : "#000000", fillOpacity: 0.1 };
}

// 把色带配色填进 annotations 里留下的那只空壳。单视图图表和 DualAxes 都把 annotations
// 写在顶层（转换时才变成 children 末尾的一个 mark），所以只有一处要改；返回改到的
// mark，调用方可以核对覆盖面。
export function applyHighlightBandStyle(config, style) {
	const bands = (Array.isArray(config.annotations) ? config.annotations : []).filter(
		(mark) => mark?.type === "rangeX",
	);
	for (const band of bands) {
		band.style = { ...band.style, ...fresh(style) };
	}
	return bands;
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

// tooltip 的明暗配色。引擎的深色主题把文字压到 #A6A6A6（对比度 6.77），而图表上的
// 数字是纯白 / 纯黑加双层光晕——「亮度一致」要补的正是这个差距。
// 三个跟主题走的色：文字色、描边（光晕）色、边框色。文字与描边和数值标签同源
// （labelTextStyle 的 text / halo），边框取一层低对比的分隔色，与网格线同量级。
// 引擎深色主题另外把 title / name-label / value 三条各自染成 #A6A6A6，逐条盖掉，
// 否则只改容器 color 会被更具体的那三条继承赢走。
export function tooltipStyle(dark) {
	const text = dark ? "#FFFFFF" : "#000000";
	const halo = dark ? "#1F1F1F" : "#FFFFFF";
	const border = dark ? "#3D3D3D" : "#D9D9D9";
	return {
		".g2-tooltip": {
			color: text,
			"border-color": border,
			"-webkit-text-stroke-color": halo,
		},
		".g2-tooltip-title": { color: text },
		".g2-tooltip-list-item-name-label": { color: text },
		".g2-tooltip-list-item-value": { color: text },
	};
}

// 把明暗色值合进 interaction.tooltip.css。逐个选择器浅合并：色值和上面的排版键写在
// 同一张表里，整块替换会把 padding / max-width 那些一起冲掉。
// 单视图图表的 interaction 挂在 config 上，DualAxes 也挂在顶层（plots 深合并下发给
// 每个 child），所以只有一处要改；返回改到的 css 表，调用方可以核对覆盖面。
export function applyTooltipStyle(config, style) {
	const tooltip = config.interaction?.tooltip;
	if (!tooltip?.css) return undefined;
	const css = { ...tooltip.css };
	for (const [selector, rules] of Object.entries(style)) {
		css[selector] = { ...css[selector], ...fresh(rules) };
	}
	config.interaction = { ...config.interaction, tooltip: { ...tooltip, css } };
	return css;
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

function buildChartFromRows({ rows, attrs, attributes, xKey, common: baseCommon }) {
	const bars = splitList(attrs.bars ?? attrs.bar);
	const lines = splitList(attrs.lines ?? attrs.line);
	const explicit = splitList(attrs.series ?? attrs.y);
	// series= 与 bars=/lines= 取并集，而不是「有 series= 就只认 series=」。后者会把
	// 只在 bars=/lines= 里点过名的列整个丢掉：它在数据里、在标签里都写着，就是不画，
	// 也不报错。组合图不走这里（它按角色分别读 bars/lines），所以这条只影响单视图
	// 图型——包括类型写错降级到 line/bar 的那条路。
	let seriesKeys = explicit.length ? [...new Set([...explicit, ...bars, ...lines])] : [...bars, ...lines];
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
	// 类型写错不让整块图消失：仍按缺省规则出图，另外挂一条局部提示说明哪个词没被
	// 认出、实际画成了什么。整块失败留给「图根本画不出来」的情况——两者的区别是
	// 「图在，但有一处写错了」对「图不在」，读者据此知道该不该相信眼前这张图。
	const typeNotice =
		rawType === "" || CHART_TYPES.has(rawType)
			? undefined
			: `Unknown chart type "${rawType}" — drawn as "${type}". Supported: ${[...CHART_TYPES].join(", ")}.`;
	const common = typeNotice
		? { ...baseCommon, warning: [baseCommon.warning, typeNotice].filter(Boolean).join("; ") }
		: baseCommon;
	const showLabels = labelsEnabled(attrs);
	// 只认数据里真有的周期，并且去重。加粗对写错的名字本来就是空转，色带不是：色带的
	// x 通道和数据 mark 共用同一条 x scale，一个不存在的周期名会给 band scale 凭空多出
	// 一个类别，图上多一根没有数据的空列。加粗和色带用同一份名单。
	const periodsInData = new Set(rows.map((row) => String(row[xKey])));
	const highlight = [...new Set(splitList(attrs.highlight))].filter((p) =>
		periodsInData.has(p),
	);
	const band = highlightBand(highlight);

	if (type === "combo" || type === "combo-dual-axis") {
		let barKeys = bars,
			lineKeys = lines;
		if (barKeys.length === 0 && lineKeys.length === 0) {
			[barKeys, lineKeys] = [seriesKeys.slice(0, 1), seriesKeys.slice(1)]; // 缺省分配：首个为 bar，其余为 line
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
		// 三个 child 共用同一条 x scale，而 G2 按 scale 分组合并 guide、后写的覆盖
		// 先写的，所以 highlight 的配置得每个 child 各带一份且完全一致。每次调用返回
		// 一个新对象：同一份配置被两处引用会在渲染层被就地改写。
		const xAxis = () => {
			const x = highlightAxisX(highlight);
			return x ? { x } : {};
		};
		const barAxis = {
			...xAxis(),
			y: {
				...fresh(Y_AXIS),
				labelFormatter: barFormatter,
				...(dual && leftUnit ? { title: leftUnit } : {}),
			},
		};
		// 只有 combo-dual-axis 才画右轴。combo 的设计是「柱和线共用同一段值域」，
		// 既然共用，右轴就是左轴的逐格复制——同样的数字印两遍，还平白误导读者以为
		// 这两个指标分属两个量纲。关掉它绘图区还能变宽一截。
		// axis: { y: false } 是引擎认的关法：addGuideToScale 的 normalize() 把 false
		// 折成 scale.y.guide = null，inferComponent 再按 guide === null 整条滤掉。
		const lineAxis = dual
			? {
					...xAxis(),
					y: {
						...fresh(Y_AXIS),
						position: "right",
						// 每条连续轴默认自带一层网格。右轴的刻度和左轴不在同一批高度上，
						// 两层网格叠出来是两倍密度的横线；网格只留给左轴。
						grid: false,
						labelFormatter: lineFormatter,
						...(rightUnit ? { title: rightUnit } : {}),
					},
				}
			: { ...xAxis(), y: false };
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
				// 只有折线那几个系列拿横杠标记，柱系列仍是方块。
				legend: legendConfig(lineKeys.map((key) => labelFor(attrs, key))),
				state: fresh(HOVER_BAND_STATE),
				// 写在顶层是唯一正确的路径：plots 的 transformOptions 把 interaction
				// 收进 rest、深合并进每个 child mark，G2 的 bubbleOptions() 再把 mark
				// 上的 interaction 合并回 view。两个键都不在 TRANSFORM_OPTION_KEY 里，
				// 转换过后不会被清掉。
				interaction: fresh(COMBO_INTERACTION),
				// 组合图有三个数据 mark，色带仍只画一次：annotations 写在顶层，转换出来
				// 的是一个 mark，不是每个 child 各一份。
				...(band ? { annotations: band } : {}),
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
	const highlightX = highlightAxisX(highlight);
	const seriesLabels = seriesKeys.map((key) => labelFor(attrs, key));
	const config = {
		data,
		xField: "period",
		yField: "value",
		// colorField 而非 seriesField：v5 的 seriesField 只拆分系列不着色，也不出
		// 图例；分组 / 堆叠取不到 series 通道时会回落到 color 通道，够用。
		colorField: "series",
		scale: { color: { range: colorsFor(attrs, seriesKeys) }, y: yScale({ domainMax: yMax }) },
		label: showLabels
			? valueLabel("value", formatter, type === "stacked-bar")
			: undefined,
		axis: {
			...(highlightX ? { x: highlightX } : {}),
			y: { ...fresh(Y_AXIS), labelFormatter: formatter, ...(unit ? { title: unit } : {}) },
		},
		tooltip: valueTooltip("value", formatter),
		// 折线图的每个系列都是折线，图例全给横杠；柱图全给方块。
		legend: legendConfig(type === "line" ? seriesLabels : []),
		...(band ? { annotations: band } : {}),
	};
	if (type === "line")
		return {
			...common,
			chartType: "Line",
			config: {
				...config,
				// 折线图的 x 默认是 point 比例尺（paddingInner 恒为 1 → bandWidth 恒为
				// 0），rangeX 拿到的列宽就是 0，色带会缩成一条看不见的零宽度线。想要
				// 色带有宽度，这条 scale 就必须是 band——padding 沿用柱图那一份，色带
				// 宽度因此和柱图一致。折线自己会加 getBandWidth()/2 的偏移把点摆回列
				// 中心（mark/line.ts 的 xoffset），组合图里的折线一直是这么画的。
				// 只有点名了 highlight= 才换：没点名的折线图一个像素都不动。
				...(band ? { scale: { ...config.scale, x: { type: "band", ...fresh(BAR_X_SCALE) } } } : {}),
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
